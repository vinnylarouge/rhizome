// cost.js — fine-grained API cost tracking (per call), appended to data/costs.jsonl.
// Rates are ASSUMED (gpt-5.4 pricing is post-training-cutoff); adjust RATES below to
// match your billing if you want exact figures. Token counts are always exact.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COSTS_FILE = path.join(__dirname, '..', 'data', 'costs.jsonl');

// USD per 1M tokens — ASSUMED placeholders, edit to your actual rates.
const RATES = {
  'gpt-5.4-mini': { in: 0.25, out: 2.0 },
  'gpt-5.4': { in: 1.25, out: 10.0 },
  'gpt-5.4-nano': { in: 0.05, out: 0.4 },
  default: { in: 1.0, out: 5.0 },
};

export function recordUsage({ model, label, usage }) {
  if (!usage) return;
  const r = RATES[model] || RATES.default;
  const pin = usage.prompt_tokens || 0;
  const pout = usage.completion_tokens || 0;
  const usd = (pin * r.in + pout * r.out) / 1e6;
  const row = {
    t: new Date().toISOString(),
    label, model,
    prompt_tokens: pin, completion_tokens: pout,
    est_usd: Number(usd.toFixed(6)),
  };
  try {
    fs.appendFileSync(COSTS_FILE, JSON.stringify(row) + '\n');
  } catch { /* never let cost logging break a worker */ }
}
