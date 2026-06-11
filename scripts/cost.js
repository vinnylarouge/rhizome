// cost.js — summarise the newest session's costs.jsonl. Run: `npm run cost`.
import fs from 'node:fs';
import path from 'node:path';
import { newestSessionDir } from './session-dir.js';

const dir = newestSessionDir();
if (!dir) { console.log('No sessions yet.'); process.exit(0); }
const file = path.join(dir, 'costs.jsonl');

if (!fs.existsSync(file)) { console.log('No costs logged yet.'); process.exit(0); }
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const byLabel = {};
let totUsd = 0, totIn = 0, totOut = 0, calls = 0;
for (const r of rows) {
  const b = (byLabel[r.label] ||= { calls: 0, in: 0, out: 0, usd: 0 });
  b.calls++; b.in += r.prompt_tokens; b.out += r.completion_tokens; b.usd += r.est_usd;
  totUsd += r.est_usd; totIn += r.prompt_tokens; totOut += r.completion_tokens; calls++;
}
console.log(`\nRhizome API cost  (${calls} calls)\n` + '='.repeat(52));
console.log('worker'.padEnd(12), 'calls'.padStart(6), 'in'.padStart(9), 'out'.padStart(8), 'est $'.padStart(10));
for (const [label, b] of Object.entries(byLabel).sort((a, c) => c[1].usd - a[1].usd)) {
  console.log(label.padEnd(12), String(b.calls).padStart(6), String(b.in).padStart(9), String(b.out).padStart(8), b.usd.toFixed(4).padStart(10));
}
console.log('-'.repeat(52));
console.log('TOTAL'.padEnd(12), String(calls).padStart(6), String(totIn).padStart(9), String(totOut).padStart(8), totUsd.toFixed(4).padStart(10));
console.log('\n(est $ uses ASSUMED rates in src/cost.js — edit to your billing for exact figures)\n');
