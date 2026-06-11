// settings.js — Rhizome's single source of configuration truth.
// RHIZOME_HOME/settings.json deep-merged over defaults, then env overrides
// (OPENAI_API_KEY + the legacy LOOM_* vars) so .env dev workflows keep working.
// llm.js resolves tiers through resolveTier() at call time, which is what makes
// settings changes apply with no server restart.

import fs from 'node:fs';
import path from 'node:path';
import { home } from './paths.js';

const DEFAULTS = {
  providers: [
    {
      id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '',
      flags: { reasoningEffort: true, webSearch: true, jsonMode: true },
    },
    {
      id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', apiKey: '',
      flags: { reasoningEffort: false, webSearch: false, jsonMode: true },
    },
  ],
  tiers: {
    fast: { providerId: 'openai', model: 'gpt-5.4-mini', effort: 'none' },
    strong: { providerId: 'openai', model: 'gpt-5.4', effort: 'low' },
    paper: { providerId: 'openai', model: 'gpt-5.5', effort: 'low' },
    embeddings: { providerId: 'openai', model: 'text-embedding-3-small' },
  },
  repoPath: '',     // where update-from-git runs; auto-filled when running unpackaged
  extensions: {},   // per-extension settings, keyed by extension id
};

export function defaults() {
  return structuredClone(DEFAULTS);
}

let cache = null;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Plain objects merge recursively; arrays and scalars replace wholesale.
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (!isObj(base) || !isObj(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

const file = () => path.join(home(), 'settings.json');

export function load() {
  let fromDisk = {};
  try {
    fromDisk = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    /* no settings file yet — defaults apply */
  }
  const s = deepMerge(defaults(), fromDisk);

  if (process.env.OPENAI_API_KEY) {
    const p = s.providers.find((x) => x.id === 'openai');
    if (p) p.apiKey = process.env.OPENAI_API_KEY;
  }
  const envTier = (tier, modelVar, effortVar) => {
    if (process.env[modelVar]) s.tiers[tier].model = process.env[modelVar];
    if (effortVar && process.env[effortVar]) s.tiers[tier].effort = process.env[effortVar];
  };
  envTier('fast', 'LOOM_FAST_MODEL', 'LOOM_FAST_EFFORT');
  envTier('strong', 'LOOM_STRONG_MODEL', 'LOOM_STRONG_EFFORT');
  envTier('paper', 'LOOM_PAPER_MODEL', 'LOOM_PAPER_EFFORT');

  cache = s;
  return s;
}

export function get() {
  return cache || load();
}

// Deep-merge a patch, persist atomically, refresh the cache. Masked apiKeys
// (the '…' form produced by redacted()) are swapped back for the stored key,
// so the settings UI can post back exactly what it was shown.
export function update(patch) {
  const cur = get();
  const p = structuredClone(patch);
  if (Array.isArray(p.providers)) {
    for (const prov of p.providers) {
      if (typeof prov.apiKey === 'string' && prov.apiKey.includes('…')) {
        const old = cur.providers.find((x) => x.id === prov.id);
        prov.apiKey = old ? old.apiKey : '';
      }
    }
  }
  const next = deepMerge(cur, p);
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file());
  cache = next;
  return next;
}

// Clone safe to send to browsers (the board is reachable over LAN): keys are
// masked to '<head>…<last4>' and never round-trip in full.
export function redacted() {
  const s = structuredClone(get());
  for (const p of s.providers) {
    p.apiKey = p.apiKey ? (p.apiKey.length > 8 ? p.apiKey.slice(0, 3) : '') + '…' + p.apiKey.slice(-4) : '';
  }
  return s;
}

// Join a tier with its provider → everything llm.js needs for one call.
export function resolveTier(name) {
  const s = get();
  const t = s.tiers[name];
  if (!t) return null;
  const p = s.providers.find((x) => x.id === t.providerId);
  if (!p) return null;
  return {
    baseUrl: (p.baseUrl || '').replace(/\/+$/, ''),
    apiKey: p.apiKey || '',
    model: t.model,
    effort: t.effort,
    flags: { reasoningEffort: false, webSearch: false, jsonMode: true, ...(p.flags || {}) },
  };
}
