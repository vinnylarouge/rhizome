// llm.test.js — provider abstraction: payload shaping per capability flags,
// defensive JSON parsing for local models, embeddings, mixed tiers.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { start } from '../fixtures/mock-provider.mjs';
import * as settings from '../src/settings.js';
import { chatJSON, embed } from '../src/llm.js';

let mockA, mockB;

before(async () => {
  process.env.RHIZOME_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'rhizome-llm-'));
  delete process.env.OPENAI_API_KEY;
  mockA = await start();
  mockB = await start();
  settings.load();
  settings.update({
    providers: [
      { id: 'openai', label: 'OpenAI-ish', baseUrl: `http://127.0.0.1:${mockA.port}/v1`, apiKey: 'sk-x',
        flags: { reasoningEffort: true, webSearch: false, jsonMode: true } },
      { id: 'local', label: 'Local-ish', baseUrl: `http://127.0.0.1:${mockB.port}/v1`, apiKey: '',
        flags: { reasoningEffort: false, webSearch: false, jsonMode: false } },
    ],
    tiers: {
      fast: { providerId: 'local', model: 'llama-mock', effort: 'none' },
      strong: { providerId: 'openai', model: 'gpt-mock', effort: 'low' },
      embeddings: { providerId: 'openai', model: 'embed-mock' },
    },
  });
});

after(async () => {
  await mockA.close();
  await mockB.close();
});

test('flagged-off provider gets no reasoning_effort/response_format; fenced JSON still parses', async () => {
  const out = await chatJSON({ tier: 'fast', system: 'Reply ONLY with JSON {"ok":true}.', user: 'ping', label: 'test' });
  assert.deepEqual(out, { ok: true });
  const call = mockB.calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.ok(call, 'local mock received the call');
  assert.equal(call.body.reasoning_effort, undefined);
  assert.equal(call.body.response_format, undefined);
  assert.equal(call.body.model, 'llama-mock');
});

test('flagged-on provider gets both OpenAI fields', async () => {
  const out = await chatJSON({ tier: 'strong', system: 'Reply ONLY with JSON {"ok":true}.', user: 'ping', label: 'test' });
  assert.deepEqual(out, { ok: true });
  const call = mockA.calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.ok(call, 'openai mock received the call');
  assert.equal(call.body.reasoning_effort, 'low');
  assert.deepEqual(call.body.response_format, { type: 'json_object' });
});

test('embed() returns one vector per input', async () => {
  const vecs = await embed(['alpha', 'beta']);
  assert.equal(vecs.length, 2);
  assert.equal(vecs[0].length, 8);
  assert.notDeepEqual(vecs[0], vecs[1]);
});

test('unresolvable tier returns null, never throws', async () => {
  settings.update({ tiers: { paper: { providerId: 'gone', model: 'x' } } });
  const out = await chatJSON({ tier: 'paper', system: 'json', user: 'x', label: 'test' });
  assert.equal(out, null);
});
