// compile.js — the /compile orchestrator. Chains the deterministic linearizer, the
// citation agency, the styled prose generator, and the LaTeX compile into one call.
// This is what the server's POST /api/compile invokes. Everything streams progress
// through onProgress so the room can watch it work.

import fs from 'node:fs';
import path from 'node:path';
import { buildPlan } from './plan.js';
import { citePlan } from './cite.js';
import { composePaper } from './prose.js';
import { compile as latexCompile } from './latex.js';
import { webSearchSelfTest } from '../llm.js';

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

// Write an audit manifest of every citation decision next to the paper.
function writeReceipts(dir, doc, plan, enabled) {
  const verified = (plan.receipts || []).filter((r) => r.status === 'verified');
  const dropped = (plan.receipts || []).filter((r) => r.status !== 'verified');
  const L = [];
  L.push(`# Citation receipts — ${doc.title}`);
  L.push(`Generated ${stamp()} · web search: ${enabled ? 'on' : 'off'} · verified: ${verified.length} · unsupported/private: ${dropped.length}`);
  L.push('');
  L.push('## Verified (every cite traces to a fetched passage)');
  for (const r of verified) {
    L.push(`- **${r.claim}**`);
    L.push(`  - ${r.url}`);
    if (r.quote) L.push(`  - quote: "${r.quote}"`);
  }
  if (!verified.length) L.push('_(none)_');
  L.push('');
  L.push('## Unsupported or private (no citation attached — never fabricated)');
  for (const r of dropped) L.push(`- ${r.claim}`);
  if (!dropped.length) L.push('_(none)_');
  try {
    fs.writeFileSync(path.join(dir, 'receipts.md'), L.join('\n'));
  } catch { /* manifest is best-effort */ }
}

export async function compilePaper(state, { onProgress = () => {}, outDir, citationsEnabled, genre } = {}) {
  outDir = outDir || path.join(process.cwd(), 'data');

  onProgress('Linearising the discussion…');
  const plan = buildPlan(state, { genre });

  let enabled = citationsEnabled;
  if (enabled === undefined) {
    onProgress('Checking web-search availability…');
    enabled = await webSearchSelfTest();
  }
  onProgress(enabled ? 'Finding citation receipts…' : 'Web search unavailable — proceeding without external citations.');
  await citePlan(plan, { onProgress, enabled });

  const doc = await composePaper(plan, { onProgress });

  const stem = 'paper-' + stamp();
  onProgress('Typesetting and compiling the PDF…');
  const res = await latexCompile(doc, { outDir, stem });

  if (res.dir) writeReceipts(res.dir, doc, plan, enabled);

  const verified = (plan.receipts || []).filter((r) => r.status === 'verified').length;
  return {
    ok: res.ok,
    stem,
    genre: plan.genre,
    dir: res.dir,
    texPath: res.texPath,
    pdfPath: res.pdfPath,
    receiptsPath: res.dir ? path.join(res.dir, 'receipts.md') : null,
    log: res.ok ? '' : res.log,
    citationsEnabled: enabled,
    counts: {
      sections: doc.sections.length,
      references: doc.references.length,
      verifiedCitations: verified,
      notes: plan.meta.noteCount,
    },
  };
}
