// cite.js — the citation research-agency. Conservative scope + strict single-verifier.
//
// For each cite-bearing item (empirical factChecks with a verifiable verdict, and
// heuristic provenance) it: (1) web-searches for a supporting source, then (2)
// independently fetches each candidate URL and requires a verifier to QUOTE the
// passage that supports the claim. A citation exists only if that quote is found —
// the quote IS the receipt. Otherwise the item is flagged [unsupported]; nothing is
// ever fabricated. If web_search is unavailable, every item is flagged unsupported.

import { responsesWebSearch, chatJSON } from '../llm.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Strip tracking params so receipts are clean canonical URLs.
function cleanUrl(u) {
  try {
    const url = new URL(u);
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return u;
  }
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
// Fetch a URL and reduce it to readable plain text (no HTML-parsing dependency).
async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RhizomePaperBot/1.0)', Accept: 'text/html,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!/html|text|xml/.test(ct)) return '';
    let html = await res.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] || ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return html;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// Two verifier modes. EVIDENCE: the page must directly support a specific empirical
// claim (quote the supporting passage). PROVENANCE: the page must be a credible
// reference that defines/discusses a named concept (quote a defining passage). Using
// one prompt for both wrongly rejects provenance sources for not matching a paraphrase.
const VERIFY_SYS = {
  evidence:
    'You are a strict citation verifier. Given a CLAIM and the PAGE TEXT of a candidate ' +
    'source, decide whether the page DIRECTLY supports the claim. Be conservative: if the ' +
    'page is unrelated, only tangential, or you are unsure, it is NOT supported. If it is ' +
    'supported, return the exact short passage (<=40 words, copied verbatim from the page) ' +
    'that supports it, plus best-effort bibliographic metadata read from the page.\n' +
    'Reply ONLY with JSON: {"supported": true|false, "quote": "verbatim passage or empty", ' +
    '"author": "author or publisher or empty", "year": "YYYY or empty", "publisher": "site/org or empty"}',
  provenance:
    'You are a strict citation verifier checking the PROVENANCE of a named concept. Given a ' +
    'CONCEPT and the PAGE TEXT of a candidate source, decide whether the page is a credible ' +
    'reference (encyclopaedia, textbook, paper, or reputable institution) that DEFINES or ' +
    'substantively DISCUSSES that concept (closely-related canonical names count). A bare ' +
    'passing mention is not enough. If it qualifies, return a short verbatim passage (<=40 ' +
    'words, copied from the page) that names or defines the concept, plus best-effort metadata.\n' +
    'Reply ONLY with JSON: {"supported": true|false, "quote": "verbatim passage or empty", ' +
    '"author": "author or publisher or empty", "year": "YYYY or empty", "publisher": "site/org or empty"}',
};

// Verify one candidate URL. `mode` is 'evidence' | 'provenance'. Returns null unless supported.
async function verify(target, url, mode = 'evidence') {
  const page = await fetchText(url);
  if (!page || page.length < 200) return null; // can't read it -> can't verify -> drop
  const head = mode === 'provenance' ? 'CONCEPT' : 'CLAIM';
  const out = await chatJSON({
    tier: 'paper',
    system: VERIFY_SYS[mode],
    user: `${head}: "${target}"\n\nPAGE TEXT (excerpt):\n${page.slice(0, 6000)}`,
    label: 'cite-verify',
    maxTokens: 320,
    timeoutMs: 40000,
  });
  if (out && out.supported === true && out.quote && out.quote.trim().length > 8) {
    return { quote: out.quote.trim(), author: (out.author || '').trim(), year: (out.year || '').trim(), publisher: (out.publisher || '').trim() };
  }
  return null;
}

// Find + verify one citation. Returns the receipt record or null.
async function citeClaim({ target, query, mode = 'evidence' }) {
  // web_search latency is variable; allow plenty of time and retry once on a
  // transient abort so a slow search doesn't masquerade as "no source found".
  let r = await responsesWebSearch({ input: query, label: 'cite-search', timeoutMs: 90000 });
  if (!r) r = await responsesWebSearch({ input: query, label: 'cite-search-retry', timeoutMs: 90000 });
  if (!r || !r.citations.length) return null;
  // de-dup candidate URLs, keep order
  const seen = new Set();
  const cands = [];
  for (const c of r.citations) {
    const u = cleanUrl(c.url);
    if (!seen.has(u)) { seen.add(u); cands.push({ url: u, title: c.title || '' }); }
  }
  for (const c of cands.slice(0, 3)) {
    const v = await verify(target, c.url, mode);
    if (v) return { url: c.url, title: c.title, ...v };
  }
  return null;
}

function slugKey(seed, used) {
  let base = (seed || 'src').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'src';
  let key = base;
  let i = 2;
  while (used.has(key)) key = base + i++;
  used.add(key);
  return key;
}

// Decorate the plan with verified citations. Mutates evidence/heuristic items
// (citationKey | unsupported) and sets plan.references (bib) + plan.receipts (audit).
// `enabled` defaults to true; pass false to skip all web work (offline / no tool).
export async function citePlan(plan, { onProgress = () => {}, enabled = true } = {}) {
  const references = [...(plan.fixedCitations || [])];
  const used = new Set(references.map((r) => r.key));
  const byUrl = new Map(); // url -> key (reuse a key if the same source supports two items)
  const receipts = [];
  const urldate = todayISO();

  const attach = (item, claim, hit) => {
    if (!hit) {
      item.citationKey = null;
      item.unsupported = true;
      receipts.push({ claim, status: 'unsupported', url: null });
      return;
    }
    let key = byUrl.get(hit.url);
    if (!key) {
      key = slugKey(hit.author || hit.title || hit.url, used);
      byUrl.set(hit.url, key);
      references.push({
        key,
        type: 'online',
        author: hit.author || hit.title || hit.publisher || '',
        title: hit.title || hit.publisher || hit.url,
        year: hit.year || '',
        url: hit.url,
        urldate,
        note: hit.publisher || '',
      });
    }
    item.citationKey = key;
    item.unsupported = false;
    receipts.push({ claim, status: 'verified', url: hit.url, quote: hit.quote, key });
  };

  const evidence = plan.sections.find((s) => s.id === 'evidence');
  const heuristics = plan.sections.find((s) => s.id === 'heuristics');
  const evItems = evidence ? evidence.material.items : [];
  const hItems = heuristics ? heuristics.material.items : [];
  const total = (evidence ? evItems.filter((e) => e.verdict !== 'unknown').length : 0) + hItems.length;
  let done = 0;

  if (!enabled) {
    for (const e of evItems) { e.citationKey = null; e.unsupported = true; }
    for (const h of hItems) { h.citationKey = null; h.unsupported = true; }
    plan.references = references;
    plan.receipts = receipts;
    plan.citationsDisabled = true;
    return plan;
  }

  // Evidence: only chase a source for claims that aren't the room's own private
  // anecdotes. An 'unknown' verdict means we couldn't stand it up -> no citation.
  for (const e of evItems) {
    if (e.verdict === 'unknown') {
      e.citationKey = null;
      e.unsupported = true;
      e.privateClaim = true; // distinct from "we looked and found nothing"
      continue;
    }
    onProgress(`Finding a source for an empirical claim (${++done}/${total})…`);
    const hit = await citeClaim({
      target: e.statement,
      mode: 'evidence',
      query: `Find one authoritative primary source (a paper, standard, or reputable institution) that directly supports this statement, and indicate where: "${e.statement}". Avoid blogs and unreliable sources.`,
    });
    attach(e, e.statement, hit);
  }

  // Heuristic provenance: cite the established origin/definition of each thinking tool.
  for (const h of hItems) {
    onProgress(`Sourcing the provenance of "${h.name}" (${++done}/${total})…`);
    const hit = await citeClaim({
      target: h.name,
      mode: 'provenance',
      query: `Find one authoritative source (encyclopaedia, textbook, or seminal paper) defining or originating the concept known as the "${h.name}" in decision-making, economics, or systems thinking.`,
    });
    attach(h, h.name, hit);
  }

  plan.references = references;
  plan.receipts = receipts;
  return plan;
}
