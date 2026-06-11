// mock-provider.mjs — a tiny OpenAI-compatible server with canned responses, so the
// full enrichment pipeline can run offline (tests, demos, UI work on a plane).
//
//   import { start } from './fixtures/mock-provider.mjs'   → { port, calls, close }
//   node fixtures/mock-provider.mjs 9999                    → standalone on :9999
//
// /v1/chat/completions keyword-matches the system prompt to return a plausible
// object for each worker. When the request has NO response_format (a provider with
// jsonMode:false), the JSON is wrapped in markdown fences to exercise the client's
// defensive parsing — exactly what sloppy local models do.

import http from 'node:http';

function cannedFor(sys, user) {
  const s = (sys + ' ' + user).toLowerCase();
  if (s.includes('triage')) {
    return { clean: 'A tidied version of the note.', kind: 'claim', anchors: [], theme: 'Mock Theme' };
  }
  if (s.includes('connections') && s.includes('new note')) return { bridges: [] };
  if (s.includes('heuristic')) return { id: 'none', why: '' };
  if (s.includes('verdict')) {
    return { verdict: 'unknown', statement: 'A claim.', detail: 'Mock detail.', boundary: '', principle: '', coheresWith: [] };
  }
  if (s.includes('abductively')) return { value: '', question: '' };
  if (s.includes('abstractions')) return { abstractions: [] };
  if (s.includes('consolidate')) return { merges: [] };
  if (s.includes('atomic propositions')) return { props: [] };
  if (s.includes('elaborate')) return { elaboration: 'A mock elaboration with one concrete nuance.' };
  if (s.includes('ping') || s.includes('"ok"')) return { ok: true };
  return { ok: true };
}

// Deterministic pseudo-embedding: 8 dims hashed from the text, L2-normalised.
// Identical strings → identical vectors, so cosine ranking is testable.
export function fakeVector(text) {
  const v = new Array(8).fill(0);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    v[c % 8] += ((c * 2654435761) % 1000) / 1000;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function start({ port = 0 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(data || '{}'); } catch { /* tolerate */ }
      calls.push({ url: req.url, body });
      const json = (obj) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.url.endsWith('/chat/completions')) {
        const sys = (body.messages || []).find((m) => m.role === 'system')?.content || '';
        const user = (body.messages || []).find((m) => m.role === 'user')?.content || '';
        const obj = cannedFor(sys, user);
        // No response_format → behave like a chatty local model: fence the JSON.
        const content = body.response_format
          ? JSON.stringify(obj)
          : '```json\n' + JSON.stringify(obj) + '\n```';
        return json({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        });
      }
      if (req.url.endsWith('/embeddings')) {
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        return json({
          data: inputs.map((t, index) => ({ index, embedding: fakeVector(String(t)) })),
          usage: { prompt_tokens: 5, total_tokens: 5 },
        });
      }
      res.writeHead(404);
      res.end('mock: not found');
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        calls,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Standalone: node fixtures/mock-provider.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await start({ port: Number(process.argv[2]) || 9999 });
  console.log(`mock provider →  http://127.0.0.1:${port}/v1  (chat/completions + embeddings)`);
}
