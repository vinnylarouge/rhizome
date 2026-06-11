// search.test.js — embeddings index: cosine ranking, dedupe on re-index,
// substring fallback when no embeddings tier is configured.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { start, fakeVector } from '../fixtures/mock-provider.mjs';
import * as settings from '../src/settings.js';
import * as cores from '../src/cores.js';
import * as store from '../src/store.js';
import * as search from '../src/extensions/search.js';

let mock;
before(async () => {
  process.env.RHIZOME_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'rhizome-search-'));
  delete process.env.OPENAI_API_KEY;
  mock = await start();
  settings.load();
  settings.update({
    providers: [{ id: 'mock', label: 'Mock', baseUrl: `http://127.0.0.1:${mock.port}/v1`, apiKey: '', flags: { jsonMode: true } }],
    tiers: { embeddings: { providerId: 'mock', model: 'embed-mock' } },
  });
  cores.seed();
  store.load();
});

after(async () => {
  store.flush();
  await mock.close();
});

test('cosine ranks the exact-text match first across sessions', async () => {
  store.createSession({ title: 'Alpha', coreId: 'roundtable' });
  store.addNote({ text: 'procurement timelines are too slow for AI' });
  store.addNote({ text: 'universities lack compute budgets' });
  store.flush();
  store.createSession({ title: 'Beta', coreId: 'roundtable' });
  store.addNote({ text: 'trust depends on auditability' });
  store.flush();

  const indexed = await search.backfill();
  assert.ok(indexed >= 3, `indexed ${indexed} nodes`);

  const r = await search.query('procurement timelines are too slow for AI');
  assert.equal(r.mode, 'semantic');
  assert.ok(r.results.length >= 1);
  assert.equal(r.results[0].text, 'procurement timelines are too slow for AI');
  assert.ok(r.results[0].sessionTitle === 'Alpha', 'result carries its session');
});

test('backfill twice does not duplicate index rows', async () => {
  const first = fs.readFileSync(path.join(process.env.RHIZOME_HOME, 'search-index.jsonl'), 'utf8').trim().split('\n').length;
  await search.backfill();
  const second = fs.readFileSync(path.join(process.env.RHIZOME_HOME, 'search-index.jsonl'), 'utf8').trim().split('\n').length;
  assert.equal(first, second);
});

test('no embeddings tier → labelled substring fallback', async () => {
  settings.update({ tiers: { embeddings: { providerId: 'gone', model: '' } } });
  const r = await search.query('auditability');
  assert.equal(r.mode, 'substring');
  assert.ok(r.results.some((x) => x.text.includes('auditability')));
  settings.update({ tiers: { embeddings: { providerId: 'mock', model: 'embed-mock' } } });
});

test('fakeVector is deterministic (mock sanity)', () => {
  assert.deepEqual(fakeVector('abc'), fakeVector('abc'));
  assert.notDeepEqual(fakeVector('abc'), fakeVector('xyz'));
});
