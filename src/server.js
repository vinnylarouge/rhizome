// server.js — ties it together. Node http for static + JSON API, ws for live push.
// Note-taking path (POST /api/note) is fully synchronous and never awaits the LLM;
// enrichment is queued and streamed back over the websocket as it lands.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { loadEnv, activeSessionDir } from './paths.js';
import * as settings from './settings.js';
import * as cores from './cores.js';
import * as store from './store.js';
import { loadHeuristics } from './heuristics.js';
import { processNote, mergeThemesPass, mergeFramesPass, abstractPass, elaborate, chunkPass, abductPass } from './workers.js';
import { compilePaper } from './paper/compile.js';
import { describeTiers, selfTest } from './llm.js';
import * as ext from './extensions/index.js';
import { query as searchQuery } from './extensions/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

loadEnv();
settings.load(); // after loadEnv so .env-provided keys are visible as overrides
cores.seed();    // bundled cores → user dir (first run only; edits never clobbered)

store.load();
loadHeuristics();
await ext.loadAll();
const PORT = Number(process.env.PORT) || 7777;

// Context handed to extension command handlers and event hooks.
const extCtx = () => ({ store, settings, broadcastStatus, broadcast });

// --- websocket broadcast ----------------------------------------------------
let wss;
function broadcast() {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'state', state: store.get() });
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}
// Push a transient status line (for chunky commands) so the UI can show progress.
function broadcastStatus(text) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'status', text: text || '', busy: !!text });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
// Notify clients that a compiled paper is ready (or failed) with a download link.
function broadcastPaper(url, ok) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'paper', url, ok: !!ok });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
// Which graph nodes a worker is currently operating on (for the drone overlay).
const activeIds = new Set();
function broadcastActivity() {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'activity', ids: [...activeIds] });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}
function setActive(id, on) { if (on) activeIds.add(id); else activeIds.delete(id); broadcastActivity(); }

// --- work queue (sequential — bounds cost, keeps ordering sane, and lets the
//     periodic theme-merge run safely between notes rather than during one) ----
const queue = [];
let running = false;
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const task = queue.shift();
    try {
      await task();
    } catch (e) {
      console.error('[queue] task failed:', e.message);
    }
  }
  running = false;
}
function enqueue(task) {
  queue.push(task);
  drain();
}

// (Periodic work is now driven by the client-side /auto toggle, which round-robins
//  organise → abduct → abstract → chunk → merge. No fixed server-side auto-pass.)

// --- static files -----------------------------------------------------------
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const full = path.join(PUBLIC, path.normalize(rel));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream',
      // No caching: this tool is iterated live, so a reload must always get fresh assets.
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

// --- http server ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/api/state') return json(res, 200, store.get());
  if (req.method === 'GET' && url === '/api/cores') return json(res, 200, { cores: cores.list() });

  // --- session library ---
  if (req.method === 'GET' && url === '/api/sessions') return json(res, 200, { sessions: store.listSessions() });
  if (req.method === 'POST' && url === '/api/sessions') {
    const body = await readBody(req);
    const s = store.createSession({ title: (body.title || '').trim() || 'Live Discussion', coreId: body.coreId });
    broadcast();
    return json(res, 200, { ok: true, id: s.session.id });
  }
  if (req.method === 'POST' && url === '/api/sessions/open') {
    const body = await readBody(req);
    const s = store.openSession(body.id);
    if (!s) return json(res, 404, { error: 'not found' });
    broadcast();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/sessions/archive') {
    const body = await readBody(req);
    const ok = store.archiveSession(body.id);
    broadcast();
    return json(res, ok ? 200 : 404, { ok });
  }

  // --- search + extension commands (work regardless of active session) ---
  if (req.method === 'GET' && url === '/api/search') {
    const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
    if (!q) return json(res, 200, { mode: 'none', results: [] });
    return json(res, 200, await searchQuery(q));
  }
  if (req.method === 'POST' && url === '/api/command') {
    const body = await readBody(req);
    const cmd = ext.commands()[(body.cmd || '').toLowerCase()];
    if (!cmd) return json(res, 404, { error: 'unknown command' });
    enqueue(async () => {
      broadcastStatus(cmd.hint + '…');
      try {
        const msg = await cmd.handler(body.args || '', extCtx());
        if (msg && store.hasActive()) store.addFeedItem({ type: 'extension', head: cmd.extId, text: msg });
        else if (msg) broadcastStatus(msg);
      } catch (e) {
        console.error(`[ext:${cmd.extId}] command failed:`, e.message);
      } finally {
        broadcastStatus('');
        broadcast();
      }
    });
    return json(res, 200, { ok: true });
  }

  // --- settings (work regardless of active session; keys never leave redacted) ---
  if (req.method === 'GET' && url === '/api/settings') {
    return json(res, 200, { settings: settings.redacted(), schemas: ext.schemas() });
  }
  if (req.method === 'POST' && url === '/api/settings') {
    const body = await readBody(req);
    settings.update(body.settings || {});
    // Hot reload is free: llm.js resolves tiers at call time. Just tell the room.
    console.log('[settings] updated; tiers now:', JSON.stringify(describeTiers()));
    return json(res, 200, { ok: true, settings: settings.redacted() });
  }
  if (req.method === 'POST' && url === '/api/settings/test') {
    const body = await readBody(req);
    const ok = await selfTest(body.tier || 'fast');
    return json(res, 200, { ok });
  }

  // Everything below operates on the active session.
  if (url.startsWith('/api/') && url !== '/api/health' && !store.hasActive() && req.method === 'POST') {
    return json(res, 409, { error: 'no-session' });
  }
  if (req.method === 'GET' && url === '/api/health') {
    const s = store.get(); // null on first boot, before any session exists
    return json(res, 200, { ok: true, tiers: describeTiers(), session: !!s, paused: s ? s.paused : false, notes: s ? s.notes.length : 0 });
  }

  // Serve a compiled paper artifact (PDF / .tex / receipts.md), sandboxed to the
  // active session's papers/ directory.
  if (req.method === 'GET' && url === '/api/paper') {
    const file = (new URL(req.url, 'http://x').searchParams.get('file') || '').trim();
    const papersDir = activeSessionDir() && path.join(activeSessionDir(), 'papers');
    if (!papersDir) { res.writeHead(404); return res.end('no active session'); }
    const full = path.join(papersDir, path.normalize(file));
    if (!file || !full.startsWith(papersDir + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
    const ext = path.extname(full);
    const ctype = ext === '.pdf' ? 'application/pdf' : ext === '.md' ? 'text/markdown; charset=utf-8' : ext === '.tex' ? 'text/plain; charset=utf-8' : 'application/octet-stream';
    return fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  }

  if (req.method === 'POST' && url === '/api/note') {
    const body = await readBody(req);
    if (!store.hasActive()) return json(res, 409, { error: 'no-session' });
    if (!body.text || !body.text.trim()) return json(res, 400, { error: 'empty' });
    const note = store.addNote({ text: body.text });
    broadcast();                                      // node appears instantly, no LLM in the path
    enqueue(async () => {                              // enrichment happens async (drone on the node)
      setActive(note.id, true);
      try { await processNote(note.id, broadcast); } finally { setActive(note.id, false); }
      // Tell extensions (e.g. the search indexer) about the enriched note.
      const s = store.get();
      const fresh = s && s.notes.find((n) => n.id === note.id);
      if (fresh) await ext.emit('note-enriched', { sessionId: s.session.id, note: fresh }, extCtx());
    });
    return json(res, 200, { note });
  }
  if (req.method === 'POST' && url === '/api/note/delete') {
    const body = await readBody(req);
    store.deleteNote(body.id);
    broadcast();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/merge') {
    enqueue(async () => {
      broadcastStatus('Consolidating themes…');
      try { await mergeThemesPass(broadcast); } catch (e) { console.error('[merge themes]', e.message); }
      broadcastStatus('Consolidating abstractions…');
      try { await mergeFramesPass(broadcast); } finally { broadcastStatus(''); }
    });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/abstract') {
    enqueue(async () => { broadcastStatus('Finding abstractions…'); try { await abstractPass(broadcast); } finally { broadcastStatus(''); } });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/saymore') {
    const body = await readBody(req);
    if (body.id) enqueue(async () => {
      setActive(body.id, true); broadcastStatus('Elaborating…');
      try { await elaborate(body.id, broadcast); } finally { broadcastStatus(''); setActive(body.id, false); }
    });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/chunk') {
    enqueue(async () => { broadcastStatus('Chunking long points…'); try { await chunkPass(broadcast); } finally { broadcastStatus(''); } });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/abduct') {
    enqueue(async () => { broadcastStatus('Surfacing values & questions…'); try { await abductPass(broadcast); } finally { broadcastStatus(''); } });
    return json(res, 200, { ok: true });
  }
  // /compile [genre] — turn the session into a cited LaTeX paper (post-session,
  // long-running). Enqueued like other passes so it never races note enrichment.
  if (req.method === 'POST' && url === '/api/compile') {
    const body = await readBody(req);
    // 'policy-brief' | 'roundtable' | 'academic'; undefined → the core's default genre
    const genre = body.genre || cores.activeCore()?.compile?.defaultGenre;
    enqueue(async () => {
      broadcastStatus('Compiling the report…');
      try {
        const out = await compilePaper(store.get(), { outDir: path.join(activeSessionDir(), 'papers'), genre, onProgress: (m) => broadcastStatus(m) });
        if (out.ok) {
          const rel = `${out.stem}/${out.stem}.pdf`;
          const link = '/api/paper?file=' + encodeURIComponent(rel);
          store.addFeedItem({ type: 'paper', head: out.genre, text: `${out.counts.verifiedCitations} verified citations across ${out.counts.notes} notes`, detail: link });
          broadcastPaper(link, true);
        } else {
          store.addFeedItem({ type: 'paper', head: 'failed', text: 'Report compile failed (see terminal)', detail: '' });
          console.error('[compile] LaTeX failed:\n' + (out.log || '').slice(-3000));
          broadcastPaper('', false);
        }
      } catch (e) {
        console.error('[compile] error:', e.stack || e.message);
        broadcastStatus('Compile error: ' + e.message);
      } finally {
        broadcast();
        setTimeout(() => broadcastStatus(''), 4000);
      }
    });
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url === '/api/pause') {
    const body = await readBody(req);
    const p = store.setPaused(body.paused);
    broadcast();
    return json(res, 200, { paused: p });
  }
  if (req.method === 'POST' && url === '/api/title') {
    const body = await readBody(req);
    store.setTitle(body.title || 'Live Discussion');
    broadcast();
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET') return serveStatic(req, res);
  json(res, 404, { error: 'not found' });
});

// --- websocket --------------------------------------------------------------
wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state: store.get() }));
});

server.listen(PORT, async () => {
  console.log(`\n  ✳ Rhizome running →  http://localhost:${PORT}`);
  for (const [tier, desc] of Object.entries(describeTiers())) console.log(`    ${tier.padEnd(10)} ${desc}`);
  process.stdout.write('    self-test (fast-tier reachability): ');
  const ok = await selfTest();
  console.log(ok ? 'PASS ✓' : 'FAIL ✗  (check OPENAI_API_KEY / network — note-taking still works, enrichment will not)');
  console.log('');
});
