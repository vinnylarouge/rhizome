// workers.js — the live "subagents". On each committed note we run a cheap triage,
// then fan out (in parallel) to theme clustering, bridge-finding, heuristic matching,
// and (for the core's factcheckKinds) fact-check + boundary + generalisation.
//
// Everything discussion-type-specific (prompts, kinds, anchors, gates) comes from
// the active CORE (src/cores.js) — this file is pure orchestration.
//
// Everything is best-effort and additive: any worker may return null and the note
// still stands. `emit()` pushes current state to all browsers after each mutation.

import * as store from './store.js';
import { chatJSON } from './llm.js';
import { catalog, getHeuristic } from './heuristics.js';
import { activeCore, renderPrompt } from './cores.js';

const MAX_CONTEXT_NOTES = 28;
const trunc = (s, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);
// Prefer the AI-tidied text everywhere downstream; fall back to raw if not yet set.
const dtext = (n) => n.clean || n.text;

const sysFor = (name) => renderPrompt(activeCore(), name);

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

const anchorIdByLabel = (label) => {
  const a = activeCore().anchors.find((x) => x.label === label);
  return a ? a.id : null;
};

// ---- 1. Triage -------------------------------------------------------------
async function triage(note) {
  const { themes } = recentContext(note.id);
  const existing = themes.length ? `\nExisting emergent themes:\n${themes.join('\n')}` : '';
  const out = await chatJSON({
    tier: 'fast',
    system: sysFor('triage'),
    user: `Raw note: "${note.text}"${existing}\nReuse an existing theme label verbatim ONLY if this note is about the SAME specific topic; otherwise give a new, more precise label. Favour precision over reuse — distinct topics get distinct themes.`,
    label: 'triage',
    maxTokens: 260,
  });
  return out;
}

// Parent type drives node colour. Derive from kind via the core's map, falling
// back to the first anchor the model assigned.
function deriveParent(t) {
  const core = activeCore();
  const byKind = (core.kindToParent || {})[t.kind];
  if (byKind) return byKind;
  const a = (t.anchors || [])[0];
  const anchor = core.anchors.find((x) => x.label === a);
  return anchor ? anchor.parent : null;
}

// ---- 2. Bridges ------------------------------------------------------------
async function findBridges(note) {
  const { notes, themes } = recentContext(note.id);
  if (notes.length === 0 && themes.length === 0) return;
  const user =
    `NEW note (${note.id}): "${dtext(note)}"\n\n` +
    `Existing notes:\n${notes.join('\n') || '(none)'}\n\n` +
    `Existing themes:\n${themes.join('\n') || '(none)'}`;
  const out = await chatJSON({ tier: 'fast', system: sysFor('bridges'), user, label: 'bridge', maxTokens: 400 });
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
  const user = `Note: "${dtext(note)}"\n\nCatalog:\n${catalog()}`;
  const out = await chatJSON({ tier: 'fast', system: sysFor('heuristic'), user, label: 'heuristic', maxTokens: 150 });
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
  const user = `Item: "${dtext(note)}"\n\nExisting themes: ${themes.join(', ') || '(none yet)'}`;
  const out = await chatJSON({ tier: 'strong', system: sysFor('factcheck'), user, label: 'factcheck', maxTokens: 500, timeoutMs: 40000 });
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

// ---- 5. Abduction: surface what the core says is latent --------------------
// From eligible notes, infer what is implicit (the core's abduction.targets — e.g.
// the value at stake + an open question, or a root cause + an action). These become
// *derived* (ghosted) nodes on their target anchors, linked back by an "abduced"
// edge — never confused with what a participant actually said.
async function abduct(note) {
  const core = activeCore();
  const out = await chatJSON({ tier: 'fast', system: sysFor('abduct'), user: dtext(note), label: 'abduct', maxTokens: 200 });
  if (!out) return;
  for (const tgt of core.abduction?.targets || []) {
    const val = out[tgt.field];
    if (val && typeof val === 'string' && val.trim()) {
      const dn = store.addDerivedNote({ text: val.trim(), kind: tgt.kind, parent: tgt.parent, derivedFrom: note.id });
      store.attachNoteToTheme(dn.id, tgt.anchorId);
      store.addBridge({ source: note.id, target: dn.id, type: 'abduced', rationale: tgt.rationale });
    }
  }
}

// ---- Orchestrator ----------------------------------------------------------
export async function processNote(noteId, emit) {
  const state = store.get();
  if (state.paused) return;
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;
  const enrich = activeCore().enrich || {};

  // Triage first: tidy the note, classify it, colour it, place it.
  const t = await triage(note);
  if (t) {
    const cleanText = (t.clean && t.clean.trim()) || note.text;
    store.patchNote(noteId, { kind: t.kind || note.kind, clean: cleanText, parent: deriveParent(t) });
    if (cleanText.replace(/\s+/g, ' ').toLowerCase() !== note.text.replace(/\s+/g, ' ').toLowerCase())
      store.addFeedItem({ type: 'refine', text: cleanText, ref: note.id });
    for (const a of t.anchors || []) {
      const aid = anchorIdByLabel(a);
      if (aid) store.attachNoteToTheme(noteId, aid);
    }
    if (t.theme) {
      const theme = store.upsertEmergentTheme(t.theme, '');
      store.attachNoteToTheme(noteId, theme.id);
    }
    emit();
  }

  const kind = (t && t.kind) || note.kind;
  if ((enrich.skipKinds || ['other']).includes(kind)) return; // purely procedural — no further enrichment

  // Fan out. Each worker emits as it finishes so the room sees things arrive live.
  const jobs = [findBridges(note).then(emit)];
  if ((enrich.heuristicKinds || []).includes(kind)) jobs.push(matchHeuristic(note).then(emit));
  if ((enrich.factcheckKinds || []).includes(kind)) jobs.push(factCheck(note).then(emit));
  // Abduction is on-demand (/abduct), not automatic — keeps the baseline graph
  // close to what was actually said.
  await Promise.allSettled(jobs);
  emit();
}

// /abduct: surface what is latent across eligible notes on demand.
export async function abductPass(emit) {
  const s = store.get();
  const abduceKinds = new Set(activeCore().enrich?.abduceKinds || []);
  const eligible = s.notes.filter((n) => !n.derived && !n.abducted && abduceKinds.has(n.kind));
  if (!eligible.length) return;
  for (const note of eligible.slice(0, 12)) {
    await abduct(note);
    store.patchNote(note.id, { abducted: true });
    emit();
  }
}

// ---- Periodic theme consolidation -----------------------------------------
// Runs via /merge (and /auto), serialized through the same queue as note
// processing so it never races a note's theme attachment. Conservative: only
// merges themes that clearly name the same concept.
export async function mergeThemesPass(emit) {
  const emergent = store.get().themes.filter((t) => t.kind !== 'anchor');
  if (emergent.length < 3) return; // nothing worth consolidating yet
  const list = emergent.map((t) => `${t.id} :: ${t.label} (${t.noteIds.length})`).join('\n');
  const out = await chatJSON({ tier: 'fast', system: sysFor('mergeThemes'), user: `Themes (id :: label (note count)):\n${list}`, label: 'merge', maxTokens: 400 });
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
  const out = await chatJSON({ tier: 'fast', system: sysFor('mergeFrames'), user: `Abstractions (id :: [kind] name):\n${list}`, label: 'merge-frames', maxTokens: 400 });
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
  const user = `Themes (id :: label):\n${themeList}\n\nRecent points:\n${notes.join('\n')}`;
  const out = await chatJSON({ tier: 'strong', system: sysFor('abstract'), user, label: 'abstract', maxTokens: 700, timeoutMs: 45000 });
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
  const out = await chatJSON({ tier: 'strong', system: sysFor('elaborate'), user: `The ${kind}: "${subject}"`, label: 'saymore', maxTokens: 300 });
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
    const out = await chatJSON({ tier: 'fast', system: sysFor('chunk'), user: dtext(note), label: 'chunk', maxTokens: 400 });
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
