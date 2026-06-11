// store.js — crash-resilient, multi-session state.
// Sessions live at RHIZOME_HOME/sessions/<id>/ — session.json (atomic-written on
// every change), events.jsonl (append-only audit log), costs.jsonl, papers/.
// Nothing here ever calls the network; note-taking must never depend on the LLM.
// Nothing is ever deleted: archiving moves a session under sessions/.archive/.

import fs from 'node:fs';
import path from 'node:path';
import { home, setActiveSessionDir } from './paths.js';
import * as cores from './cores.js';

const SESSIONS_DIR = () => path.join(home(), 'sessions');

let state = null;       // active session state (null = no session open)
let sessionDir = null;  // its directory
let saveTimer = null;

const STATE_FILE = () => path.join(sessionDir, 'session.json');
const EVENTS_FILE = () => path.join(sessionDir, 'events.jsonl');

function anchorTheme(a) {
  return { id: a.id, label: a.label, kind: 'anchor', summary: '', noteIds: [] };
}

function freshState(core, id, title) {
  return {
    session: { id, title: title || 'Live Discussion', coreId: core.id, startedAt: new Date().toISOString() },
    core: cores.clientSummary(core), // what the browser needs: anchors, parents, colours
    paused: false,
    notes: [],
    themes: core.anchors.map(anchorTheme),
    bridges: [],
    heuristicHits: [],
    factChecks: [],
    boundaryConditions: [],
    generalisations: [],
    feed: [], // reverse-chron activity log of AI-generated structure (left rail)
    frames: [], // conceptual abstractions (metaphors / frames) found via /abstract
  };
}

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

const slug = (title) =>
  ((title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'session';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');

// ---- session lifecycle ------------------------------------------------------

// Startup: migrate any legacy single-session loom files, then resume the most
// recently touched session (today's behaviour). No sessions → null; the UI shows
// the library so the facilitator picks a core and a title.
export function load() {
  fs.mkdirSync(SESSIONS_DIR(), { recursive: true });
  migrateLegacy();
  const list = listSessions();
  if (list.length) {
    const opened = openSession(list[0].id);
    if (opened) return opened;
  }
  state = null;
  sessionDir = null;
  setActiveSessionDir(null);
  cores.setActive(cores.get('roundtable')); // a sane default until a session opens
  return null;
}

// Pre-rhizome layout: session.json/events.jsonl/costs.jsonl directly in the data
// dir. Move (never copy/delete) into a proper session folder.
function migrateLegacy() {
  const legacyState = path.join(home(), 'session.json');
  if (!fs.existsSync(legacyState)) return;
  let title = 'Legacy Session';
  try { title = JSON.parse(fs.readFileSync(legacyState, 'utf8'))?.session?.title || title; } catch { /* move it anyway */ }
  const id = `${slug(title)}-${stamp()}`;
  const dir = path.join(SESSIONS_DIR(), id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['session.json', 'events.jsonl', 'costs.jsonl']) {
    const src = path.join(home(), f);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(dir, f));
  }
  console.log(`[store] migrated legacy session "${title}" → sessions/${id}`);
}

export function createSession({ title, coreId } = {}) {
  flush();
  const core = cores.get(coreId || 'roundtable') || cores.get('roundtable');
  cores.setActive(core);
  let id = `${slug(title)}-${stamp()}`;
  for (let n = 2; fs.existsSync(path.join(SESSIONS_DIR(), id)); n++) id = `${slug(title)}-${stamp()}-${n}`;
  sessionDir = path.join(SESSIONS_DIR(), id);
  fs.mkdirSync(path.join(sessionDir, 'papers'), { recursive: true });
  setActiveSessionDir(sessionDir);
  state = freshState(core, id, title);
  persist();
  logEvent('session-created', { id, title: state.session.title, coreId: core.id });
  return state;
}

export function openSession(id) {
  const dir = path.join(SESSIONS_DIR(), id);
  const file = path.join(dir, 'session.json');
  if (!fs.existsSync(file)) return null;
  flush(); // never lose pending writes from the session being switched away from
  let loaded;
  try {
    loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[store] sessions/${id}/session.json unreadable, backing it up:`, e.message);
    fs.renameSync(file, file + '.corrupt-' + Date.now());
    return null;
  }
  // The session's core drives anchors/prompts; legacy loom sessions are roundtable.
  const core = cores.get(loaded?.session?.coreId || 'roundtable') || cores.get('roundtable');
  cores.setActive(core);
  state = loaded;
  state.session.id = id;
  state.session.coreId = core.id;
  state.core = cores.clientSummary(core); // recomputed so core edits propagate
  // Defensive: ensure anchors and feed always exist even if an old file is loaded.
  for (const a of core.anchors) {
    if (!state.themes.find((t) => t.id === a.id)) state.themes.unshift(anchorTheme(a));
  }
  if (!Array.isArray(state.feed)) state.feed = [];
  if (!Array.isArray(state.frames)) state.frames = [];
  sessionDir = dir;
  setActiveSessionDir(sessionDir);
  console.log(`[store] opened session "${state.session.title}" (${state.notes.length} notes)`);
  return state;
}

export function listSessions() {
  let names = [];
  try { names = fs.readdirSync(SESSIONS_DIR()); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue; // .archive et al.
    const file = path.join(SESSIONS_DIR(), name, 'session.json');
    try {
      const s = JSON.parse(fs.readFileSync(file, 'utf8'));
      out.push({
        id: name,
        title: s.session?.title || name,
        coreId: s.session?.coreId || 'roundtable',
        coreName: s.core?.name || s.session?.coreId || 'roundtable',
        startedAt: s.session?.startedAt || '',
        notes: (s.notes || []).filter((n) => !n.derived).length,
        mtime: fs.statSync(file).mtimeMs,
      });
    } catch { /* unreadable/corrupt entries simply aren't listed */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// Move a session out of the library, keeping every file (never deletes).
export function archiveSession(id) {
  const src = path.join(SESSIONS_DIR(), id);
  if (!fs.existsSync(src)) return false;
  if (sessionDir === src) {
    flush();
    state = null;
    sessionDir = null;
    setActiveSessionDir(null);
  }
  const dst = path.join(SESSIONS_DIR(), '.archive', id);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
  return true;
}

export function hasActive() {
  return !!state;
}

export function get() {
  return state;
}

// Force any debounced write to disk now (used before switching sessions and by tests).
export function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (state && sessionDir) {
    try { persist(); } catch (e) { console.error('[store] flush failed:', e.message); }
  }
}

// ---- persistence ------------------------------------------------------------

// Atomic write: write to a temp file then rename (rename is atomic on the same fs),
// so a crash mid-write can never leave a half-written, corrupt session.json.
function persist() {
  if (!sessionDir) return;
  const tmp = STATE_FILE() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE());
}

// Debounce disk writes so a burst of worker updates coalesces, but never lose
// data: we still flush synchronously on every logged event below.
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { persist(); } catch (e) { console.error('[store] persist failed:', e.message); }
  }, 120);
}

function logEvent(type, payload) {
  if (!sessionDir) return;
  try {
    fs.appendFileSync(EVENTS_FILE(), JSON.stringify({ t: new Date().toISOString(), type, payload }) + '\n');
  } catch (e) {
    console.error('[store] event log failed:', e.message);
  }
}

const rid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// A human label for a node id, used in feed lines (kept full — titles aren't clamped).
function shortLabel(id) {
  const n = state.notes.find((x) => x.id === id);
  if (n) return trunc(n.clean || n.text, 160);
  const t = state.themes.find((x) => x.id === id);
  return t ? t.label : id;
}

// Append to the activity feed (left rail). Capped so it never grows unbounded.
// `head` is an optional chip rendered as a header on the feed line. `ref` is the id
// of the graph element (node/theme/frame/bridge) this entry points to, so clicking
// the feed line can highlight it in the graph.
export function addFeedItem({ type, text, detail, head, ref }) {
  state.feed.push({ id: rid('fd'), ts: new Date().toISOString(), type, text, detail: detail || '', head: head || null, ref: ref || null });
  if (state.feed.length > 300) state.feed = state.feed.slice(-300);
  scheduleSave();
}

// A conceptual abstraction (metaphor or frame) spanning one or more themes.
export function addFrame({ name, frameKind, gist, themeIds }) {
  const norm = (name || '').trim();
  if (!norm) return null;
  let f = state.frames.find((x) => x.name.toLowerCase() === norm.toLowerCase());
  if (f) {
    if (gist && gist.length > f.gist.length) f.gist = gist;
    for (const t of themeIds || []) if (!f.themeIds.includes(t)) f.themeIds.push(t);
    scheduleSave();
    return f;
  }
  f = {
    id: rid('fr'),
    name: norm,
    frameKind: frameKind === 'metaphor' ? 'metaphor' : 'frame',
    gist: gist || '',
    themeIds: (themeIds || []).slice(),
    ts: new Date().toISOString(),
  };
  state.frames.push(f);
  logEvent('frame', f);
  addFeedItem({ type: 'abstract', head: f.frameKind, text: f.name, detail: f.gist, ref: f.id });
  scheduleSave();
  return f;
}

// Merge several abstractions (frames/metaphors) into one. Survivor = the one
// spanning the most themes; their themeIds union and the richer gist are kept.
export function mergeFrames(ids, canonicalName) {
  const idset = new Set(ids);
  const group = state.frames.filter((f) => idset.has(f.id));
  if (group.length < 2) return null;
  group.sort((a, b) => b.themeIds.length - a.themeIds.length);
  const survivor = group[0];
  if (canonicalName && canonicalName.trim()) survivor.name = canonicalName.trim();
  const losers = group.slice(1);
  const mergedNames = losers.map((f) => f.name);
  for (const loser of losers) {
    for (const tid of loser.themeIds) if (!survivor.themeIds.includes(tid)) survivor.themeIds.push(tid);
    if (loser.gist && loser.gist.length > survivor.gist.length) survivor.gist = loser.gist;
    state.frames = state.frames.filter((f) => f.id !== loser.id);
  }
  logEvent('frame-merge', { into: survivor.id, name: survivor.name, merged: mergedNames });
  addFeedItem({ type: 'merge', head: 'merged', text: `${mergedNames.join(', ')} → ${survivor.name}`, ref: survivor.id });
  scheduleSave();
  return { survivor, mergedNames };
}

// --- Mutations. Each returns the created/changed entity and triggers save + log. ---

export function addNote({ text }) {
  const note = {
    id: rid('n'),
    text: text.trim(),   // raw, as typed (kept for the audit log)
    clean: null,         // AI-tidied version shown in the UI (set by triage)
    parent: null,        // anchor parent key — drives colour
    ts: new Date().toISOString(),
    kind: 'unclassified',
    themeIds: [],
  };
  state.notes.push(note);
  logEvent('note', note);
  scheduleSave();
  return note;
}

// Patch arbitrary fields on a note (used by triage for clean/kind/parent).
export function patchNote(id, fields) {
  const n = state.notes.find((x) => x.id === id);
  if (n) { Object.assign(n, fields); scheduleSave(); }
  return n;
}

// A note the AI inferred (abducted), not something a participant said. Marked
// `derived` so the UI can ghost it, and it is NOT re-enriched (already classified).
export function addDerivedNote({ text, kind, parent, derivedFrom }) {
  const note = {
    id: rid('n'),
    text: text.trim(),
    clean: text.trim(),
    parent: parent || null,
    ts: new Date().toISOString(),
    kind,
    themeIds: [],
    derived: true,
    derivedFrom: derivedFrom || null,
  };
  state.notes.push(note);
  logEvent('derived-note', note);
  scheduleSave();
  return note;
}

export function deleteNote(id) {
  state.notes = state.notes.filter((n) => n.id !== id);
  for (const t of state.themes) t.noteIds = t.noteIds.filter((x) => x !== id);
  state.bridges = state.bridges.filter((b) => b.source !== id && b.target !== id);
  state.heuristicHits = state.heuristicHits.filter((h) => h.noteId !== id);
  state.factChecks = state.factChecks.filter((f) => f.noteId !== id);
  state.boundaryConditions = state.boundaryConditions.filter((b) => b.noteId !== id);
  state.generalisations = state.generalisations.filter((g) => g.noteId !== id);
  logEvent('note-delete', { id });
  scheduleSave();
}

export function setNoteKind(id, kind) {
  const n = state.notes.find((x) => x.id === id);
  if (n) { n.kind = kind; scheduleSave(); }
  return n;
}

// Attach a note to a theme by theme id; idempotent on both sides.
export function attachNoteToTheme(noteId, themeId) {
  const note = state.notes.find((n) => n.id === noteId);
  const theme = state.themes.find((t) => t.id === themeId);
  if (!note || !theme) return;
  if (!note.themeIds.includes(themeId)) note.themeIds.push(themeId);
  if (!theme.noteIds.includes(noteId)) theme.noteIds.push(noteId);
  scheduleSave();
}

// Find an emergent theme by case-insensitive label, or create one.
export function upsertEmergentTheme(label, summary) {
  const norm = label.trim();
  let theme = state.themes.find(
    (t) => t.kind !== 'anchor' && t.label.toLowerCase() === norm.toLowerCase()
  );
  if (!theme) {
    theme = { id: rid('t'), label: norm, kind: 'emergent', summary: summary || '', noteIds: [] };
    state.themes.push(theme);
    logEvent('theme', theme);
    addFeedItem({ type: 'theme', text: `New theme · ${norm}`, ref: theme.id });
  } else if (summary && summary.length > theme.summary.length) {
    theme.summary = summary;
  }
  scheduleSave();
  return theme;
}

// Merge several emergent themes into one. The survivor is the theme with the most
// notes; all notes and bridges are repointed to it, and duplicate/self-loop bridges
// are cleaned up. Returns {survivor, mergedLabels} or null if nothing to merge.
export function mergeThemes(ids, canonicalLabel) {
  const idset = new Set(ids);
  const group = state.themes.filter((t) => t.kind !== 'anchor' && idset.has(t.id));
  if (group.length < 2) return null;
  group.sort((a, b) => b.noteIds.length - a.noteIds.length);
  const survivor = group[0];
  if (canonicalLabel && canonicalLabel.trim()) survivor.label = canonicalLabel.trim();
  const losers = group.slice(1);
  const mergedLabels = losers.map((t) => t.label);

  for (const loser of losers) {
    for (const nid of loser.noteIds) {
      const note = state.notes.find((n) => n.id === nid);
      if (note) {
        note.themeIds = note.themeIds.filter((x) => x !== loser.id);
        if (!note.themeIds.includes(survivor.id)) note.themeIds.push(survivor.id);
      }
      if (!survivor.noteIds.includes(nid)) survivor.noteIds.push(nid);
    }
    for (const b of state.bridges) {
      if (b.source === loser.id) b.source = survivor.id;
      if (b.target === loser.id) b.target = survivor.id;
    }
    state.themes = state.themes.filter((t) => t.id !== loser.id);
  }

  // Drop self-loops and duplicate edges created by repointing.
  const seen = new Set();
  state.bridges = state.bridges.filter((b) => {
    if (b.source === b.target) return false;
    const key = [b.source, b.target].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logEvent('merge', { into: survivor.id, label: survivor.label, merged: mergedLabels });
  addFeedItem({ type: 'merge', head: 'merged', text: `${mergedLabels.join(', ')} → ${survivor.label}`, ref: survivor.id });
  scheduleSave();
  return { survivor, mergedLabels };
}

export function addBridge({ source, target, type, rationale }) {
  // Avoid duplicate edges between the same pair (either direction).
  const exists = state.bridges.find(
    (b) => (b.source === source && b.target === target) || (b.source === target && b.target === source)
  );
  if (exists) return exists;
  const bridge = { id: rid('b'), source, target, type: type || 'relates', rationale: rationale || '', ts: new Date().toISOString() };
  state.bridges.push(bridge);
  logEvent('bridge', bridge);
  addFeedItem({ type: 'bridge', head: bridge.type, text: `${shortLabel(source)} ↔ ${shortLabel(target)}`, detail: rationale, ref: bridge.id });
  scheduleSave();
  return bridge;
}

export function addHeuristicHit(hit) {
  const h = { id: rid('h'), ts: new Date().toISOString(), ...hit };
  state.heuristicHits.push(h);
  logEvent('heuristic', h);
  addFeedItem({ type: 'heuristic', text: `Heuristic · ${h.name}`, detail: h.why, ref: h.noteId });
  scheduleSave();
  return h;
}

export function addFactCheck(fc) {
  const f = { id: rid('f'), ts: new Date().toISOString(), ...fc };
  state.factChecks.push(f);
  logEvent('factcheck', f);
  addFeedItem({ type: 'factcheck', head: f.verdict, text: f.statement, detail: f.detail, ref: f.noteId });
  scheduleSave();
  return f;
}

export function addBoundaryCondition(bc) {
  const b = { id: rid('bc'), ts: new Date().toISOString(), ...bc };
  state.boundaryConditions.push(b);
  logEvent('boundary', b);
  addFeedItem({ type: 'boundary', text: `Boundary · ${b.text}`, ref: b.noteId });
  scheduleSave();
  return b;
}

export function addGeneralisation(g) {
  const x = { id: rid('g'), ts: new Date().toISOString(), ...g };
  state.generalisations.push(x);
  logEvent('generalisation', x);
  addFeedItem({ type: 'principle', text: `Principle · ${x.principle}`, ref: x.noteId });
  scheduleSave();
  return x;
}

// Attach an AI elaboration to whichever entity the id refers to (/saymore).
export function setElaboration(id, text) {
  const t = (text || '').trim();
  if (!t) return null;
  const note = state.notes.find((n) => n.id === id);
  if (note) { note.elaboration = t; addFeedItem({ type: 'elaborate', text: t, ref: id }); scheduleSave(); return note; }
  const theme = state.themes.find((x) => x.id === id);
  if (theme) { theme.summary = t; addFeedItem({ type: 'elaborate', text: `${theme.label}: ${t}`, ref: id }); scheduleSave(); return theme; }
  const frame = state.frames.find((x) => x.id === id);
  if (frame) { frame.gist = t; addFeedItem({ type: 'elaborate', text: `${frame.name}: ${t}`, ref: id }); scheduleSave(); return frame; }
  const bridge = state.bridges.find((x) => x.id === id);
  if (bridge) { bridge.rationale = t; addFeedItem({ type: 'elaborate', text: t, ref: id }); scheduleSave(); return bridge; }
  return null;
}

export function setPaused(p) {
  state.paused = !!p;
  logEvent('paused', { paused: state.paused });
  scheduleSave();
  return state.paused;
}

export function setTitle(title) {
  state.session.title = title;
  scheduleSave();
}
