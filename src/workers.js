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
    user: `Raw note: "${note.text}"${existing}\nReuse an existing theme label verbatim ONLY if this note is about the SAME specific topic; otherwise give a new, more precise label. Favour precision over reuse — distinct topics get distinct themes.`,
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

// ---- 5. Abduction: surface latent values & open questions ------------------
// From a painpoint/claim/anecdote, infer the value implicitly at stake and an open
// question it raises. These become *derived* (ghosted) nodes on the VALUES / OPEN
// QUESTIONS anchors, linked back by an "abduced" edge — never confused with what
// a participant actually said.
const ABDUCE_KINDS = new Set(['painpoint', 'claim', 'anecdote']);
async function abduct(note) {
  const sys =
    'You read one note from a strategy discussion and abductively surface what is IMPLICIT ' +
    'but unstated. Infer (a) the underlying VALUE at stake — what participants implicitly care ' +
    'about, phrased as a short principle; and (b) an OPEN QUESTION the note raises that the group ' +
    'should address. Include each ONLY if it is clearly and non-trivially implied — otherwise use ' +
    'an empty string. Do not restate the note; surface what is beneath or ahead of it. Be conservative.\n' +
    'Reply ONLY with JSON: {"value":"short principle or empty","question":"a question or empty"}';
  const out = await chatJSON({ tier: 'fast', system: sys, user: dtext(note), label: 'abduct', maxTokens: 200 });
  if (!out) return;
  if (out.value && out.value.trim()) {
    const dn = store.addDerivedNote({ text: out.value.trim(), kind: 'value', parent: 'values', derivedFrom: note.id });
    store.attachNoteToTheme(dn.id, 'anchor-values');
    store.addBridge({ source: note.id, target: dn.id, type: 'abduced', rationale: 'implied value' });
  }
  if (out.question && out.question.trim()) {
    const dn = store.addDerivedNote({ text: out.question.trim(), kind: 'question', parent: 'questions', derivedFrom: note.id });
    store.attachNoteToTheme(dn.id, 'anchor-questions');
    store.addBridge({ source: note.id, target: dn.id, type: 'abduced', rationale: 'question raised' });
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
      store.addFeedItem({ type: 'refine', text: cleanText, ref: note.id });
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
  // Abduction is on-demand (/abduct), not automatic — keeps the baseline graph
  // close to what was actually said.
  await Promise.allSettled(jobs);
  emit();
}

// /abduct: surface latent values & open questions across eligible notes on demand.
export async function abductPass(emit) {
  const s = store.get();
  const eligible = s.notes.filter((n) => !n.derived && !n.abducted && ABDUCE_KINDS.has(n.kind));
  if (!eligible.length) return;
  for (const note of eligible.slice(0, 12)) {
    await abduct(note);
    store.patchNote(note.id, { abducted: true });
    emit();
  }
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

// Consolidate near-duplicate abstractions (frames/metaphors). Same shape as the
// theme merge; runs as part of /merge so the magenta layer stays legible.
export async function mergeFramesPass(emit) {
  const frames = store.get().frames;
  if (frames.length < 3) return;
  const list = frames.map((f) => `${f.id} :: [${f.frameKind}] ${f.name}`).join('\n');
  const sys =
    'You consolidate a list of conceptual abstractions (metaphors and frames) from a discussion. ' +
    'Identify groups that name the SAME underlying idea — synonyms or rephrasings (e.g. ' +
    '"Trust as social license" / "Trust as a license to operate"). Be conservative: only merge ones ' +
    'that clearly mean the same thing; never merge distinct ideas. For each group pick the clearest ' +
    'canonical name.\nReply ONLY with JSON: {"merges":[{"canonical":"Name","ids":["id1","id2"]}]}. ' +
    'Empty list if nothing should merge.';
  const out = await chatJSON({ tier: 'fast', system: sys, user: `Abstractions (id :: [kind] name):\n${list}`, label: 'merge-frames', maxTokens: 400 });
  if (!out || !Array.isArray(out.merges)) return;
  const valid = new Set(frames.map((f) => f.id));
  let merged = 0;
  for (const m of out.merges) {
    if (!m || !Array.isArray(m.ids)) continue;
    const ids = m.ids.filter((id) => valid.has(id));
    if (ids.length < 2) continue;
    const res = store.mergeFrames(ids, m.canonical);
    if (res) { merged++; ids.forEach((id) => valid.delete(id)); valid.add(res.survivor.id); }
  }
  if (merged) emit();
}

// ---- Abstraction pass (/abstract) -----------------------------------------
// Surfaces the recurring conceptual abstractions — metaphors and frames — beneath
// the discussion, as frame nodes spanning the themes that instantiate them.
export async function abstractPass(emit) {
  const state = store.get();
  const themes = state.themes.filter((t) => t.kind !== 'anchor');
  const notes = state.notes.filter((n) => !n.derived).slice(-40).map((n) => `- ${dtext(n)}`);
  if (notes.length < 3) return;
  const themeList = themes.map((t) => `${t.id} :: ${t.label}`).join('\n') || '(none)';
  const sys =
    'You analyse a strategy discussion and identify the recurring ABSTRACTIONS beneath it: ' +
    'conceptual METAPHORS (e.g. "AI as an arms race", "trust as currency", "data as territory") and ' +
    'conceptual FRAMES — the implicit model in play (e.g. "zero-sum competition", "principal-agent", ' +
    '"commons governance"). Identify 2-5 that genuinely recur across multiple points; be insightful ' +
    'but not fanciful. For each, name which existing themes (by id) it spans.\n' +
    'Reply ONLY with JSON: {"abstractions":[{"name":"short name","kind":"metaphor"|"frame",' +
    '"gist":"one sentence on how it shows up here","themeIds":["id"]}]}';
  const user = `Themes (id :: label):\n${themeList}\n\nRecent points:\n${notes.join('\n')}`;
  const out = await chatJSON({ tier: 'strong', system: sys, user, label: 'abstract', maxTokens: 700, timeoutMs: 45000 });
  if (!out || !Array.isArray(out.abstractions)) return;
  const valid = new Set(themes.map((t) => t.id));
  for (const a of out.abstractions.slice(0, 6)) {
    if (!a || !a.name) continue;
    const tids = (Array.isArray(a.themeIds) ? a.themeIds : []).filter((id) => valid.has(id));
    store.addFrame({ name: a.name, frameKind: a.kind, gist: a.gist, themeIds: tids });
  }
  emit();
}

// ---- Elaboration (/saymore) -----------------------------------------------
// Elaborate one selected element (note / theme / frame / bridge) in place.
export async function elaborate(id, emit) {
  const s = store.get();
  const note = s.notes.find((n) => n.id === id);
  const theme = s.themes.find((t) => t.id === id);
  const frame = s.frames.find((f) => f.id === id);
  const bridge = s.bridges.find((b) => b.id === id);
  let subject, kind;
  if (note) { subject = dtext(note); kind = 'point'; }
  else if (theme) { subject = theme.label + (theme.summary ? ': ' + theme.summary : ''); kind = 'theme'; }
  else if (frame) { subject = frame.name + (frame.gist ? ': ' + frame.gist : ''); kind = 'abstraction'; }
  else if (bridge) { subject = bridge.rationale || 'a connection'; kind = 'connection'; }
  else return;
  const sys =
    'You elaborate one element of a live AI-strategy discussion in 1-2 substantive sentences: add the ' +
    'most useful context, implication, or nuance a facilitator would want — concrete and rigorous, ' +
    'invent no facts or citations, and do not merely restate it.\n' +
    'Reply ONLY with JSON: {"elaboration":"1-2 sentences"}';
  const out = await chatJSON({ tier: 'strong', system: sys, user: `The ${kind}: "${subject}"`, label: 'saymore', maxTokens: 300 });
  if (out && out.elaboration) { store.setElaboration(id, out.elaboration); emit(); }
}

// ---- Chunking (/chunk) -----------------------------------------------------
// Break long anecdotal notes into atomic propositions / data points (derived child
// nodes linked back to the source) that can be connected individually.
export async function chunkPass(emit) {
  const s = store.get();
  const longNotes = s.notes.filter((n) => !n.derived && !n.chunked && dtext(n).length > 140);
  if (!longNotes.length) return;
  for (const note of longNotes.slice(0, 8)) {
    const sys =
      'Break a long discussion note into 2-5 atomic propositions or data points — each a single, ' +
      'short, self-contained factual or evaluative statement that could stand and be connected on its ' +
      'own. Preserve meaning; invent nothing; do not editorialise.\n' +
      'Reply ONLY with JSON: {"props":["...","..."]}';
    const out = await chatJSON({ tier: 'fast', system: sys, user: dtext(note), label: 'chunk', maxTokens: 400 });
    if (!out || !Array.isArray(out.props) || out.props.length < 2) { store.patchNote(note.id, { chunked: true }); continue; }
    for (const p of out.props.slice(0, 5)) {
      if (!p || !p.trim()) continue;
      const dn = store.addDerivedNote({ text: p.trim(), kind: note.kind, parent: note.parent, derivedFrom: note.id });
      for (const tid of note.themeIds) store.attachNoteToTheme(dn.id, tid);
      store.addBridge({ source: dn.id, target: note.id, type: 'instance-of', rationale: 'proposition drawn from a longer point' });
    }
    store.patchNote(note.id, { chunked: true });
    emit();
  }
}
