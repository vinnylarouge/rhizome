// settings.test.js — settings load/merge/env-override/redaction/tier resolution.
// Each test gets a fresh RHIZOME_HOME tempdir; settings.load() re-reads it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as settings from '../src/settings.js';

function freshHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhizome-test-'));
  process.env.RHIZOME_HOME = dir;
  delete process.env.OPENAI_API_KEY;
  delete process.env.LOOM_FAST_MODEL;
  return dir;
}

test('defaults when no settings file exists', () => {
  freshHome();
  const s = settings.load();
  assert.equal(s.tiers.fast.model, 'gpt-5.4-mini');
  assert.equal(s.tiers.embeddings.model, 'text-embedding-3-small');
  const ids = s.providers.map((p) => p.id);
  assert.ok(ids.includes('openai') && ids.includes('ollama'));
  const ollama = s.providers.find((p) => p.id === 'ollama');
  assert.equal(ollama.flags.reasoningEffort, false);
});

test('settings file deep-merges over defaults', () => {
  const home = freshHome();
  fs.writeFileSync(
    path.join(home, 'settings.json'),
    JSON.stringify({ tiers: { fast: { providerId: 'ollama', model: 'llama3.3' } } })
  );
  const s = settings.load();
  assert.equal(s.tiers.fast.model, 'llama3.3');
  assert.equal(s.tiers.fast.providerId, 'ollama');
  assert.equal(s.tiers.strong.model, 'gpt-5.4'); // untouched tier keeps default
});

test('env vars override the file (OPENAI_API_KEY, LOOM_FAST_MODEL)', () => {
  const home = freshHome();
  fs.writeFileSync(
    path.join(home, 'settings.json'),
    JSON.stringify({ tiers: { fast: { model: 'from-file' } } })
  );
  process.env.OPENAI_API_KEY = 'sk-envkey9876';
  process.env.LOOM_FAST_MODEL = 'from-env';
  const s = settings.load();
  assert.equal(s.providers.find((p) => p.id === 'openai').apiKey, 'sk-envkey9876');
  assert.equal(s.tiers.fast.model, 'from-env');
  delete process.env.OPENAI_API_KEY;
  delete process.env.LOOM_FAST_MODEL;
});

test('update() persists atomically and survives reload', () => {
  const home = freshHome();
  settings.load();
  settings.update({ tiers: { strong: { model: 'gpt-9' } } });
  const onDisk = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  assert.equal(onDisk.tiers.strong.model, 'gpt-9');
  assert.equal(settings.load().tiers.strong.model, 'gpt-9');
});

test('update() ignores masked apiKeys (round-trip safety)', () => {
  freshHome();
  settings.load();
  settings.update({ providers: [{ id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-realkey12345678', flags: { reasoningEffort: true, webSearch: true, jsonMode: true } }] });
  // UI posts back the redacted form — the real key must survive.
  const masked = settings.redacted().providers.find((p) => p.id === 'openai').apiKey;
  assert.ok(masked.includes('…'));
  settings.update({ providers: settings.redacted().providers });
  assert.equal(settings.get().providers.find((p) => p.id === 'openai').apiKey, 'sk-realkey12345678');
});

test('redacted() masks keys, keeps empties empty', () => {
  freshHome();
  settings.load();
  settings.update({ providers: [
    { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-abcdefgh1234', flags: {} },
    { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', flags: {} },
  ] });
  const r = settings.redacted();
  assert.equal(r.providers.find((p) => p.id === 'openai').apiKey, 'sk-…1234');
  assert.equal(r.providers.find((p) => p.id === 'ollama').apiKey, '');
});

test('resolveTier joins tier + provider; unknown provider → null', () => {
  freshHome();
  settings.load();
  const fast = settings.resolveTier('fast');
  assert.equal(fast.model, 'gpt-5.4-mini');
  assert.equal(fast.baseUrl, 'https://api.openai.com/v1');
  assert.equal(fast.flags.jsonMode, true);
  settings.update({ tiers: { fast: { providerId: 'nope' } } });
  assert.equal(settings.resolveTier('fast'), null);
  assert.equal(settings.resolveTier('nonexistent-tier'), null);
});
