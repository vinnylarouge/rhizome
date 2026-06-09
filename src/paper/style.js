// style.js — anti-"AI-tell" style modulation. STYLE_CONSTRAINTS is injected into
// every prose-generation prompt; smellCheck() is the final rewrite pass that re-reads
// the assembled prose and rewrites only the sentences that still break the rules.
// Derived from docs/style-guide.md (which carries the sourced rationale + receipts).

import { chatJSON } from '../llm.js';

export const STYLE_CONSTRAINTS = `WRITE LIKE A HUMAN POLICY RAPPORTEUR, NOT AN AI. Hard rules:
- Never use these words: delve, underscore(s), intricate, interplay, showcase, leverage (as a verb), harness, navigate, navigating, realm, tapestry, mosaic, fabric, beacon, landscape, ecosystem, paradigm, robust, holistic, nuanced, seamless, seamlessly, streamlined, pivotal, groundbreaking, transformative, multifaceted, comprehensive, crucial, vibrant, compelling, ever-evolving.
- Never open a sentence with Furthermore, Moreover, Crucially, Additionally, Notably, Particularly. Use "also", "and", "but", "so", or no connective.
- Never use the antithesis template ("not just X but Y", "isn't about X, it's about Y", "X isn't Y -- it's Z"). State the point directly.
- Use at most one three-part list in the whole document; prefer two items or one.
- No present-participle sentence openers ("Navigating...", "Recognising that...", "Looking ahead...") and no "From X to Y" template.
- No signposting or meta-commentary ("It's important to note", "It's worth noting", "In this section", "As mentioned earlier", "Now that we've explored").
- Do not end a section on a restatement of what was just said; the last sentence must add a decision, a consequence, or an open question.
- Use at most one or two em-dashes in the whole document; prefer commas, periods, colons, parentheses.
- Do not hedge reflexively (often, typically, generally, may, arguably). If uncertainty is real and load-bearing, say WHY (evidence, dissent), don't just soften the verb.
- Do not pair every point with a symmetric counterpoint and decline to commit. Where the room reached a view, state it.
- Use concrete nouns, attributed-but-anonymised positions ("regulators argued", "one operator noted"), specific figures and dates. Vary sentence length sharply. Prefer short Anglo-Saxon verbs (use, show, found, cut, raise) over Latinate filler.
- Anonymise speakers (Chatham House Rule), but anonymity is never licence for vagueness: keep arguments concrete and conclusions committed.`;

const SMELL_SYS =
  'You are a line editor removing "AI writing tells" from a policy report while preserving ' +
  'meaning, facts, figures, and tense. Rewrite ONLY strings that break a rule below; return ' +
  'clean strings unchanged. Do not add content, do not soften claims, do not merge or split ' +
  'strings. Plain prose only (no markup to preserve).\n\nRULES:\n' + STYLE_CONSTRAINTS;

// Final smell-check pass over an array of plain-prose strings. Returns a same-length
// array with offending sentences rewritten; falls back to the input unchanged on any
// shape mismatch (never drops or reorders content).
export async function smellCheck(lines, model) {
  const real = lines.filter((s) => s && s.trim());
  if (!real.length) return lines;
  const budget = Math.min(8000, 600 + Math.ceil(lines.join(' ').length / 2));
  const out = await chatJSON({
    model,
    system: SMELL_SYS,
    user:
      'Rewrite only the strings that break a rule; leave the rest exactly as-is. Return ONLY ' +
      'JSON {"lines": [...]} with the SAME number of strings, in the SAME order.\n\nINPUT:\n' +
      JSON.stringify({ lines }),
    label: 'smell-check',
    maxTokens: budget,
    timeoutMs: 120000,
  });
  if (out && Array.isArray(out.lines) && out.lines.length === lines.length && out.lines.every((s) => typeof s === 'string')) {
    return out.lines;
  }
  return lines; // safe fallback — better the original prose than a mangled rewrite
}
