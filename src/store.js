// store.js — crash-resilient session state.
// Source of truth = data/session.json (atomic-written on every change).
// data/events.jsonl = append-only audit log (independent backup of every mutation).
// Nothing here ever calls the network; note-taking must never depend on the LLM.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'session.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

const ANCHORS = [
  { id: 'anchor-values', label: 'VALUES', kind: 'anchor' },
  { id: 'anchor-painpoints', label: 'PAINPOINTS', kind: 'anchor' },
  { id: 'anchor-questions', label: 'OPEN QUESTIONS', kind: 'anchor' },
];

let state = null;
let saveTimer = null;

function freshState() {
  return {
    session: { id: 'loom-' + Date.now(), title: 'Live Discussion', startedAt: new Date().toISOString() },
    paused: false,
    notes: [],
    themes: ANCHORS.map((a) => ({ ...a, summary: '', noteIds: [] })),
    bridges: [],
    heuristicHits: [],
    factChecks: [],
    boundaryConditions: [],
    generalisations: [],
    feed: [], // reverse-chron activity log of AI-generated structure (left rail)
  };
}

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      // Defensive: ensure anchors and feed always exist even if an old file is loaded.
      for (const a of ANCHORS) {
        if (!state.themes.find((t) => t.id === a.id)) {
          state.themes.unshift({ ...a, summary: '', noteIds: [] });
        }
      }
      if (!Array.isArray(state.feed)) state.feed = [];
      console.log(`[store] resumed session with ${state.notes.length} notes`);
    } catch (e) {
      console.error('[store] session.json unreadable, backing up and starting fresh:', e.message);
      fs.renameSync(STATE_FILE, STATE_FILE + '.corrupt-' + Date.now());
      state = freshState();
    }
  } else {
    state = freshState();
  }
  return state;
}

export function get() {
  return state;
}

// Atomic write: write to a temp file then rename (rename is atomic on the same fs),
// so a crash mid-write can never leave a half-written, corrupt session.json.
function persist() {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
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
  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify({ t: new Date().toISOString(), type, payload }) + '\n');
  } catch (e) {
    console.error('[store] event log failed:', e.message);
  }
}

const rid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// A short human label for a node id, used in feed lines.
function shortLabel(id) {
  const n = state.notes.find((x) => x.id === id);
  if (n) return trunc(n.clean || n.text, 46);
  const t = state.themes.find((x) => x.id === id);
  return t ? t.label : id;
}

// Append to the activity feed (left rail). Capped so it never grows unbounded.
export function addFeedItem({ type, text, detail }) {
  state.feed.push({ id: rid('fd'), ts: new Date().toISOString(), type, text, detail: detail || '' });
  if (state.feed.length > 300) state.feed = state.feed.slice(-300);
  scheduleSave();
}

// --- Mutations. Each returns the created/changed entity and triggers save + log. ---

export function addNote({ text }) {
  const note = {
    id: rid('n'),
    text: text.trim(),   // raw, as typed (kept for the audit log)
    clean: null,         // AI-tidied version shown in the UI (set by triage)
    parent: null,        // 'values' | 'painpoints' | 'questions' — drives colour
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
    addFeedItem({ type: 'theme', text: `New theme · ${norm}` });
  } else if (summary && summary.length > theme.summary.length) {
    theme.summary = summary;
  }
  scheduleSave();
  return theme;
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
  addFeedItem({ type: 'bridge', text: `${bridge.type} · ${shortLabel(source)} ↔ ${shortLabel(target)}`, detail: rationale });
  scheduleSave();
  return bridge;
}

export function addHeuristicHit(hit) {
  const h = { id: rid('h'), ts: new Date().toISOString(), ...hit };
  state.heuristicHits.push(h);
  logEvent('heuristic', h);
  addFeedItem({ type: 'heuristic', text: `Heuristic · ${h.name}`, detail: h.why });
  scheduleSave();
  return h;
}

export function addFactCheck(fc) {
  const f = { id: rid('f'), ts: new Date().toISOString(), ...fc };
  state.factChecks.push(f);
  logEvent('factcheck', f);
  addFeedItem({ type: 'factcheck', text: `${f.verdict} · ${trunc(f.statement, 56)}`, detail: trunc(f.detail, 90) });
  scheduleSave();
  return f;
}

export function addBoundaryCondition(bc) {
  const b = { id: rid('bc'), ts: new Date().toISOString(), ...bc };
  state.boundaryConditions.push(b);
  logEvent('boundary', b);
  addFeedItem({ type: 'boundary', text: `Boundary · ${trunc(b.text, 64)}` });
  scheduleSave();
  return b;
}

export function addGeneralisation(g) {
  const x = { id: rid('g'), ts: new Date().toISOString(), ...g };
  state.generalisations.push(x);
  logEvent('generalisation', x);
  addFeedItem({ type: 'principle', text: `Principle · ${trunc(x.principle, 64)}` });
  scheduleSave();
  return x;
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
