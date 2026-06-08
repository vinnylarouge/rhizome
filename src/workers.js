// workers.js — the live "subagents". On each committed note we run a cheap triage,
// then fan out (in parallel) to theme clustering, bridge-finding, heuristic matching,
// and (for claims/anecdotes) fact-check + boundary + generalisation.
//
// Everything is best-effort and additive: any worker may return null and the note
// still stands. `emit()` pushes current state to all browsers after each mutation.

import * as store from './store.js';
import { chatJSON } from './llm.js';
import { catalog, getHeuristic } from './heuristics.js';

const MAX_CONTEXT_NOTES = 28;
const trunc = (s, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);
// Prefer the AI-tidied text everywhere downstream; fall back to raw if not yet set.
const dtext = (n) => n.clean || n.text;

function recentContext(excludeId) {
  const state = store.get();
  const notes = state.notes
    .filter((n) => n.id !== excludeId)
    .slice(-MAX_CONTEXT_NOTES)
    .map((n) => `${n.id} [${n.kind}] ${trunc(dtext(n))}`);
  const themes = state.themes
    .filter((t) => t.kind !== 'anchor')
    .map((t) => `${t.id} :: ${t.label}`);
  return { notes, themes };
}

const ANCHOR_BY_NAME = {
  VALUES: 'anchor-values',
  PAINPOINTS: 'anchor-painpoints',
  'OPEN QUESTIONS': 'anchor-questions',
};

// ---- 1. Triage -------------------------------------------------------------
async function triage(note) {
  const { themes } = recentContext(note.id);
  const sys =
    'You triage one rough scribe note from a live discussion on AI strategy among ' +
    'executives, university leaders and senior military officers. The note is typed fast, ' +
    'with typos and shorthand. The two seed themes are VALUES and PAINPOINTS; questions go ' +
    'under OPEN QUESTIONS.\n' +
    'First rewrite the note into one clear, concise, grammatical sentence ("clean") — expand ' +
    'shorthand, fix typos, preserve the original meaning exactly, invent nothing, add no ' +
    'speaker or attribution.\n' +
    'Reply ONLY with JSON: {"clean": "the tidied note", ' +
    '"kind": one of "value"|"painpoint"|"question"|"anecdote"|"claim"|"decision"|"other", ' +
    '"anchors": array subset of ["VALUES","PAINPOINTS","OPEN QUESTIONS"], ' +
    '"theme": a short Title Case label (2-4 words) naming the substantive topic, or null if purely procedural}.';
  const existing = themes.length ? `\nExisting emergent themes:\n${themes.join('\n')}` : '';
  const out = await chatJSON({
    tier: 'fast',
    system: sys,
    user: `Raw note: "${note.text}"${existing}\nReuse an existing theme label verbatim if it fits.`,
    label: 'triage',
    maxTokens: 260,
  });
  return out;
}

// Parent type drives node colour. Derive from kind, falling back to the first anchor.
function deriveParent(t) {
  switch (t.kind) {
    case 'value': return 'values';
    case 'painpoint': return 'painpoints';
    case 'question': return 'questions';
  }
  const a = (t.anchors || [])[0];
  if (a === 'VALUES') return 'values';
  if (a === 'PAINPOINTS') return 'painpoints';
  if (a === 'OPEN QUESTIONS') return 'questions';
  return null;
}

// ---- 2. Bridges ------------------------------------------------------------
async function findBridges(note) {
  const { notes, themes } = recentContext(note.id);
  if (notes.length === 0 && themes.length === 0) return;
  const sys =
    'You find non-obvious connections in a live discussion. Given a NEW note and a list ' +
    'of existing notes and themes (each with an id), propose at most 2 genuinely ' +
    'insightful links FROM the new note TO an existing id. Prefer surprising cross-links ' +
    '(e.g. one person\'s painpoint echoing another\'s value). If nothing is genuinely ' +
    'insightful, return an empty list — do not force it.\n' +
    'Reply ONLY with JSON: {"bridges":[{"target":"<existing id>","type":one of ' +
    '"tension"|"echoes"|"instance-of"|"causes"|"relates","rationale":"one sentence"}]}';
  const user =
    `NEW note (${note.id}): "${dtext(note)}"\n\n` +
    `Existing notes:\n${notes.join('\n') || '(none)'}\n\n` +
    `Existing themes:\n${themes.join('\n') || '(none)'}`;
  const out = await chatJSON({ tier: 'fast', system: sys, user, label: 'bridge', maxTokens: 400 });
  if (!out || !Array.isArray(out.bridges)) return;
  const validIds = new Set([
    ...store.get().notes.map((n) => n.id),
    ...store.get().themes.map((t) => t.id),
  ]);
  for (const b of out.bridges.slice(0, 2)) {
    if (b && validIds.has(b.target) && b.target !== note.id) {
      store.addBridge({ source: note.id, target: b.target, type: b.type, rationale: b.rationale });
    }
  }
}

// ---- 3. Heuristics matcher -------------------------------------------------
async function matchHeuristic(note) {
  const sys =
    'You match a live discussion moment to the single most useful thinking heuristic ' +
    'from a catalog. Each line is: id | name | fires:HOOKS | principle. Choose the ONE ' +
    'whose firing conditions best fit this note, or "none" if none clearly applies.\n' +
    'Reply ONLY with JSON: {"id":"<catalog id or none>","why":"one sentence on why it fits here"}';
  const user = `Note: "${dtext(note)}"\n\nCatalog:\n${catalog()}`;
  const out = await chatJSON({ tier: 'fast', system: sys, user, label: 'heuristic', maxTokens: 150 });
  if (!out || !out.id || out.id === 'none') return;
  const h = getHeuristic(out.id);
  if (!h) return;
  store.addHeuristicHit({
    noteId: note.id,
    slug: h.id,
    name: h.name,
    principle: h.principle,
    questions: h.questions.slice(0, 3),
    why: out.why || '',
  });
}

// ---- 4. Fact-check + boundary + generalisation -----------------------------
async function factCheck(note) {
  const themes = store
    .get()
    .themes.filter((t) => t.kind !== 'anchor')
    .map((t) => t.label);
  const sys =
    'You provide live technical guidance on a claim or anecdote in an AI-strategy ' +
    'discussion. Be rigorous and honest. NEVER invent citations, statistics, or sources; ' +
    'if you are not confident, use verdict "unknown". Provide a boundary condition (when ' +
    'the claim holds vs breaks) and, if the item is an anecdote, the principle it ' +
    'generalises to.\n' +
    'Reply ONLY with JSON: {"verdict": one of "verified"|"needs-nuance"|"contested"|"unknown", ' +
    '"statement":"the specific claim assessed", "detail":"1-2 sentences, no fabricated sources", ' +
    '"boundary":"true, but only when… (or empty string)", "principle":"generalised principle (or empty)", ' +
    '"coheresWith": array of existing theme labels it connects to}';
  const user = `Item: "${dtext(note)}"\n\nExisting themes: ${themes.join(', ') || '(none yet)'}`;
  const out = await chatJSON({ tier: 'strong', system: sys, user, label: 'factcheck', maxTokens: 500, timeoutMs: 40000 });
  if (!out) return;
  store.addFactCheck({
    noteId: note.id,
    verdict: out.verdict || 'unknown',
    statement: out.statement || note.text,
    detail: out.detail || '',
  });
  if (out.boundary && out.boundary.trim()) {
    store.addBoundaryCondition({ noteId: note.id, text: out.boundary.trim() });
  }
  if (out.principle && out.principle.trim()) {
    store.addGeneralisation({
      noteId: note.id,
      principle: out.principle.trim(),
      coheresWith: Array.isArray(out.coheresWith) ? out.coheresWith : [],
    });
  }
}

// ---- Orchestrator ----------------------------------------------------------
export async function processNote(noteId, emit) {
  const state = store.get();
  if (state.paused) return;
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;

  // Triage first: tidy the note, classify it, colour it, place it.
  const t = await triage(note);
  if (t) {
    const cleanText = (t.clean && t.clean.trim()) || note.text;
    store.patchNote(noteId, { kind: t.kind || note.kind, clean: cleanText, parent: deriveParent(t) });
    if (cleanText.replace(/\s+/g, ' ').toLowerCase() !== note.text.replace(/\s+/g, ' ').toLowerCase())
      store.addFeedItem({ type: 'refine', text: cleanText });
    for (const a of t.anchors || []) {
      if (ANCHOR_BY_NAME[a]) store.attachNoteToTheme(noteId, ANCHOR_BY_NAME[a]);
    }
    if (t.theme) {
      const theme = store.upsertEmergentTheme(t.theme, '');
      store.attachNoteToTheme(noteId, theme.id);
    }
    emit();
  }

  const kind = (t && t.kind) || note.kind;
  if (kind === 'other') return; // purely procedural — no further enrichment

  // Fan out. Each worker emits as it finishes so the room sees things arrive live.
  const jobs = [findBridges(note).then(emit)];
  if (kind === 'question' || kind === 'painpoint') jobs.push(matchHeuristic(note).then(emit));
  if (kind === 'claim' || kind === 'anecdote') jobs.push(factCheck(note).then(emit));
  await Promise.allSettled(jobs);
  emit();
}

// ---- Periodic theme consolidation -----------------------------------------
// Runs on a timer (server.js), serialized through the same queue as note
// processing so it never races a note's theme attachment. Conservative: only
// merges themes that clearly name the same concept.
export async function mergeThemesPass(emit) {
  const emergent = store.get().themes.filter((t) => t.kind !== 'anchor');
  if (emergent.length < 3) return; // nothing worth consolidating yet
  const list = emergent.map((t) => `${t.id} :: ${t.label} (${t.noteIds.length})`).join('\n');
  const sys =
    'You consolidate a list of emergent discussion themes. Identify groups of themes ' +
    'that name the SAME concept — synonyms, rephrasings, or trivial variants ("AI Trust" / ' +
    '"Trust in AI"). Be conservative: only merge themes that clearly refer to the same thing; ' +
    'never merge themes that are merely related or adjacent — keeping real distinctions matters. ' +
    'For each group pick the clearest canonical Title Case label.\n' +
    'Reply ONLY with JSON: {"merges":[{"canonical":"Label","ids":["id1","id2"]}]}. ' +
    'Empty list if nothing should merge.';
  const out = await chatJSON({ tier: 'fast', system: sys, user: `Themes (id :: label (note count)):\n${list}`, label: 'merge', maxTokens: 400 });
  if (!out || !Array.isArray(out.merges)) return;

  const valid = new Set(emergent.map((t) => t.id));
  let merged = 0;
  for (const m of out.merges) {
    if (!m || !Array.isArray(m.ids)) continue;
    const ids = m.ids.filter((id) => valid.has(id));
    if (ids.length < 2) continue;
    const res = store.mergeThemes(ids, m.canonical);
    if (res) {
      merged++;
      ids.forEach((id) => valid.delete(id)); // consumed ids can't be reused this pass
      valid.add(res.survivor.id);
    }
  }
  if (merged) emit();
}
