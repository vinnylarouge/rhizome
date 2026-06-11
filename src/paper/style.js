// style.js — voice control. The earlier version conflated two different goals:
// "avoid AI clichés" (good) and "be terse/bursty" (which made the prose clipped and
// dry). This version keeps the cliché/fabrication bans and drops the terseness rules,
// and the smell-check now preserves warmth and length instead of sanding it flat.
// See docs/style-guide.md for the sourced rationale.

import { chatJSON } from '../llm.js';

// The hard bans — the actual giveaways of machine text. These stay strict.
const HARD_BANS = `HARD BANS (these are the real giveaways of machine text — never do them):
- Never use these words or their families: delve, underscore(s), intricate, interplay, showcase, leverage (as a verb), harness, navigate, navigating, realm, tapestry, mosaic, fabric, beacon, landscape (figurative), ecosystem (figurative), paradigm, robust, holistic, nuanced, seamless, seamlessly, streamlined, pivotal, groundbreaking, transformative, multifaceted, ever-evolving, testament to, in today's world.
- Never use the antithesis template in any form: "not just X but Y", "isn't about X, it's about Y", "X isn't Y -- it's Z". Make the point directly.
- No throat-clearing or signposting: "It's important to note", "It's worth noting", "In this section", "As mentioned earlier", "Now that we've explored", "In conclusion".
- Don't lean on "Furthermore", "Moreover", "Additionally", "Notably", "Crucially" as default sentence openers. Ordinary joins -- "and", "but", "so", "because", "yet", "still" -- are welcome.
- Never invent facts, sources, figures, names, dates, or quotations. Use only what the material gives you.`;

// The positive voice — warm and readable, the opposite of the old terse rules.
export const STYLE_CONSTRAINTS = `Write in clear, warm, readable prose — the register of a well-edited policy essay or a thoughtful briefing by a person with judgment, not a terse memo or a bulleted summary. Let ideas breathe: paragraphs may develop an argument over several sentences, and sentences may be long and flowing when the thought calls for it. You are not being graded on brevity.

${HARD_BANS}

VOICE:
- Be concrete and specific. Name positions ("regulators argued", "one operator recalled"), real figures, dates, and cases drawn from the material. Specificity is what makes prose feel earned and human.
- Write with a point of view and connective tissue. Use transitions to carry the logic from one sentence to the next; explain why one point follows another. Where the room reached a view, say so plainly; where it split, render the disagreement with fairness to both sides.
- Vary rhythm naturally — a short sentence for emphasis among longer ones — but do not chop everything into staccato, and do not pad. Aim for prose a smart reader would enjoy.
- An apt image or turn of phrase is welcome when it earns its place; only stock clichés are banned.
- Anonymise speakers (Chatham House Rule), but keep the arguments vivid and the conclusions committed. Anonymity is never an excuse for vagueness.`;

const SMELL_SYS =
  'You are a careful copy-editor making a policy report read as human-written. Fix ONLY clear ' +
  '"AI tell" problems in each string: banned cliché words, the "not just X but Y" antithesis ' +
  'template, throat-clearing/signposting phrases, and mechanical "Furthermore/Moreover" openers. ' +
  'Leave everything else exactly as written.\n' +
  'CRITICAL: do NOT shorten, chop, or flatten the prose, do NOT remove transitions or warmth, do ' +
  'NOT make sentences terser — warmth, flow, and length are wanted. Preserve meaning, specifics, ' +
  'and roughly the same length. Plain prose only.\n\nBANS TO ENFORCE:\n' + HARD_BANS;

// Final smell-check pass over an array of plain-prose strings. Returns a same-length
// array with only the banned tells fixed; falls back to the input unchanged on any
// shape mismatch (never drops, reorders, or flattens content).
export async function smellCheck(lines) {
  const real = lines.filter((s) => s && s.trim());
  if (!real.length) return lines;
  const budget = Math.min(8000, 800 + Math.ceil(lines.join(' ').length / 1.5));
  const out = await chatJSON({
    tier: 'paper',
    system: SMELL_SYS,
    user:
      'Fix only the banned tells; leave everything else (including length and warmth) exactly ' +
      'as-is. Return ONLY JSON {"lines": [...]} with the SAME number of strings, in the SAME order.\n\nINPUT:\n' +
      JSON.stringify({ lines }),
    label: 'smell-check',
    maxTokens: budget,
    timeoutMs: 120000,
  });
  if (out && Array.isArray(out.lines) && out.lines.length === lines.length && out.lines.every((s) => typeof s === 'string')) {
    return out.lines;
  }
  return lines; // safe fallback — better the original than a mangled rewrite
}
