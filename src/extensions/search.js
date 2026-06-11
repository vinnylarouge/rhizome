// search.js — AI search across all sessions (built-in extension).
// An embeddings index (RHIZOME_HOME/search-index.jsonl) grows incrementally as
// notes are enriched; /index backfills older sessions. Queries embed the question
// and rank by cosine in memory — thousands of nodes, no vector DB needed. With no
// embeddings tier configured it degrades to substring search, labelled as such.

import fs from 'node:fs';
import path from 'node:path';
import { home } from '../paths.js';
import { resolveTier } from '../settings.js';
import { embed } from '../llm.js';
import * as store from '../store.js';

const INDEX_FILE = () => path.join(home(), 'search-index.jsonl');

let cache = null; // parsed index rows, kept in sync with appends

function loadIndex() {
  if (cache) return cache;
  cache = [];
  try {
    for (const line of fs.readFileSync(INDEX_FILE(), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { cache.push(JSON.parse(line)); } catch { /* skip corrupt row */ }
    }
  } catch { /* no index yet */ }
  return cache;
}

function appendRows(rows) {
  if (!rows.length) return;
  fs.appendFileSync(INDEX_FILE(), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  loadIndex().push(...rows);
}

const key = (sessionId, nodeId) => `${sessionId}|${nodeId}`;

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

// Index one freshly-enriched note (the note-enriched hook). Best-effort.
export async function indexNote(sessionId, note) {
  const t = resolveTier('embeddings');
  if (!t || !t.model) return;
  if (loadIndex().some((r) => r.sessionId === sessionId && r.nodeId === note.id)) return;
  const text = note.clean || note.text;
  const v = await embed([text], { label: 'search-index' });
  if (!v) return;
  appendRows([{ sessionId, nodeId: note.id, kind: 'note', text, vector: v[0], model: t.model, ts: new Date().toISOString() }]);
}

// Walk every listed session and index notes + named themes not yet in the index.
// Returns how many nodes were added. Embeds in batches of 32.
export async function backfill(onProgress) {
  const t = resolveTier('embeddings');
  if (!t || !t.model) return 0;
  const have = new Set(loadIndex().map((r) => key(r.sessionId, r.nodeId)));
  const pending = [];
  for (const s of store.listSessions()) {
    let state;
    try { state = JSON.parse(fs.readFileSync(path.join(home(), 'sessions', s.id, 'session.json'), 'utf8')); } catch { continue; }
    for (const n of state.notes || []) {
      if (!have.has(key(s.id, n.id))) pending.push({ sessionId: s.id, nodeId: n.id, kind: 'note', text: n.clean || n.text });
    }
    for (const th of state.themes || []) {
      if (th.kind === 'anchor' || !(th.noteIds || []).length) continue;
      if (!have.has(key(s.id, th.id))) pending.push({ sessionId: s.id, nodeId: th.id, kind: 'theme', text: th.summary ? `${th.label}: ${th.summary}` : th.label });
    }
  }
  let added = 0;
  for (let i = 0; i < pending.length; i += 32) {
    const batch = pending.slice(i, i + 32);
    onProgress?.(`Indexing ${i + batch.length}/${pending.length}…`);
    const vecs = await embed(batch.map((p) => p.text), { label: 'search-index' });
    if (!vecs) break; // provider hiccup — whatever indexed so far stands
    const ts = new Date().toISOString();
    appendRows(batch.map((p, j) => ({ ...p, vector: vecs[j], model: t.model, ts })));
    added += batch.length;
  }
  return added;
}

// Search: semantic (cosine top-12, substring matches merged in) when an embeddings
// tier resolves; otherwise honest substring-only with mode:'substring'.
export async function query(q) {
  const rows = loadIndex();
  const titles = new Map(store.listSessions().map((s) => [s.id, s.title]));
  const decorate = (r, score, via) => ({
    sessionId: r.sessionId,
    sessionTitle: titles.get(r.sessionId) || r.sessionId,
    nodeId: r.nodeId,
    kind: r.kind,
    text: r.text,
    score: Number(score.toFixed(4)),
    via,
  });
  const needle = q.toLowerCase();
  const substring = rows.filter((r) => r.text.toLowerCase().includes(needle));

  const t = resolveTier('embeddings');
  if (t && t.model && rows.length) {
    const v = await embed([q], { label: 'search-query' });
    if (v) {
      const scored = rows
        .map((r) => ({ r, score: cosine(v[0], r.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
      const seen = new Set(scored.map((x) => key(x.r.sessionId, x.r.nodeId)));
      const results = scored.map((x) => decorate(x.r, x.score, 'semantic'));
      for (const r of substring) {
        if (!seen.has(key(r.sessionId, r.nodeId))) results.push(decorate(r, 1, 'text'));
      }
      return { mode: 'semantic', results };
    }
  }
  return { mode: 'substring', results: substring.slice(0, 20).map((r) => decorate(r, 1, 'text')) };
}

export const extension = {
  id: 'search',
  name: 'AI search',
  commands: {
    '/index': {
      hint: 'Backfill the cross-session search index',
      handler: async (args, ctx) => {
        const n = await backfill(ctx?.broadcastStatus);
        return n ? `Indexed ${n} nodes across sessions` : 'Nothing new to index (or no embeddings model configured)';
      },
    },
  },
  onSessionEvent: async (event, payload) => {
    if (event === 'note-enriched' && payload?.note && !payload.note.derived) {
      await indexNote(payload.sessionId, payload.note);
    }
  },
};
