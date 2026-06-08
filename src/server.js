// server.js — ties it together. Node http for static + JSON API, ws for live push.
// Note-taking path (POST /api/note) is fully synchronous and never awaits the LLM;
// enrichment is queued and streamed back over the websocket as it lands.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import * as store from './store.js';
import { loadHeuristics } from './heuristics.js';
import { processNote } from './workers.js';
import { MODELS, selfTest } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

// --- tiny .env loader (no dependency) --------------------------------------
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    /* .env optional if vars already in environment */
  }
}
loadEnv();

store.load();
loadHeuristics();
const PORT = Number(process.env.PORT) || 7777;

// --- websocket broadcast ----------------------------------------------------
let wss;
function broadcast() {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'state', state: store.get() });
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

// --- enrichment queue (sequential — bounds cost & keeps ordering sane) ------
const queue = [];
let running = false;
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const noteId = queue.shift();
    try {
      await processNote(noteId, broadcast);
    } catch (e) {
      console.error('[queue] processNote failed:', e.message);
    }
  }
  running = false;
}
function enqueue(noteId) {
  queue.push(noteId);
  drain();
}

// --- static files -----------------------------------------------------------
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const full = path.join(PUBLIC, path.normalize(rel));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
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
  if (req.method === 'GET' && url === '/api/health')
    return json(res, 200, { ok: true, models: MODELS, paused: store.get().paused, notes: store.get().notes.length });

  if (req.method === 'POST' && url === '/api/note') {
    const body = await readBody(req);
    if (!body.text || !body.text.trim()) return json(res, 400, { error: 'empty' });
    const note = store.addNote({ text: body.text, speaker: body.speaker });
    broadcast();           // node appears instantly, no LLM in the path
    enqueue(note.id);      // enrichment happens async
    return json(res, 200, { note });
  }
  if (req.method === 'POST' && url === '/api/note/delete') {
    const body = await readBody(req);
    store.deleteNote(body.id);
    broadcast();
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
  console.log(`\n  ✦ Loom running →  http://localhost:${PORT}`);
  console.log(`    models: fast=${MODELS.FAST} (effort ${MODELS.FAST_EFFORT}), strong=${MODELS.STRONG} (effort ${MODELS.STRONG_EFFORT})`);
  process.stdout.write('    self-test (OpenAI reachability): ');
  const ok = await selfTest();
  console.log(ok ? 'PASS ✓' : 'FAIL ✗  (check OPENAI_API_KEY / network — note-taking still works, enrichment will not)');
  console.log('');
});
