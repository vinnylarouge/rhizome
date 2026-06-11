// llm.js — provider-agnostic chat + embeddings client over native fetch.
// A "tier" (fast / strong / paper / embeddings) maps to a provider (OpenAI or any
// OpenAI-compatible local server: Ollama, LM Studio, llama.cpp, vLLM) in settings.
// Resolution happens at CALL TIME via settings.resolveTier, which is what lets the
// settings UI change providers with no server restart.
// Contract unchanged from loom: helpers return parsed JSON or null (never throw up
// to the workers — a failed enrichment must never break note-taking).

import { recordUsage } from './cost.js';
import { resolveTier, get as getSettings } from './settings.js';

async function rawCall(url, apiKey, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Local models without json_object support tend to fence or preface their JSON.
// Try a straight parse, then strip fences and take the first balanced {...} block.
function extractJSON(content) {
  try { return JSON.parse(content); } catch { /* fall through to salvage */ }
  const stripped = content.replace(/```[a-z]*/gi, '');
  const start = stripped.indexOf('{');
  if (start === -1) throw new Error('no JSON object in response');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
  }
  throw new Error('unbalanced JSON in response');
}

// chatJSON: ask a tier's model for a single JSON object. Returns the parsed object,
// or null on any failure (logged, never thrown). `model`/`effort` overrides resolve
// against the same tier's provider.
export async function chatJSON({ tier = 'fast', model: modelOverride, effort: effortOverride, system, user, label = 'worker', maxTokens = 700, timeoutMs = 30000 }) {
  const t = resolveTier(tier);
  if (!t) {
    console.error(`[llm:${label}] tier "${tier}" is unresolvable — check Settings`);
    return null;
  }
  const model = modelOverride || t.model;
  const effort = effortOverride !== undefined ? effortOverride : t.effort;

  let sys = system;
  if (t.flags.jsonMode) {
    // OpenAI's json_object response_format requires the literal word "json" somewhere
    // in the messages; guard so a prompt that forgets it can't 400 and silently drop output.
    if (!/json/i.test(system) && !/json/i.test(user)) sys = `${system}\nRespond with a single JSON object.`;
  } else {
    sys = `${system}\nRespond with ONLY a single JSON object — no prose, no code fences.`;
  }

  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  };
  if (t.flags.reasoningEffort && effort) body.reasoning_effort = effort;
  if (t.flags.jsonMode) body.response_format = { type: 'json_object' };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await rawCall(`${t.baseUrl}/chat/completions`, t.apiKey, body, timeoutMs);
      const content = data.choices?.[0]?.message?.content ?? '';
      recordUsage({ model, label, usage: data.usage });
      return extractJSON(content);
    } catch (e) {
      if (attempt === 0) continue; // one quiet retry
      console.error(`[llm:${model}] ${e.message}`);
      return null;
    }
  }
  return null;
}

// embed: texts → vectors via the embeddings tier. Returns number[][] (input order)
// or null if the tier is unconfigured or the call fails. Used by the search extension.
export async function embed(texts, { label = 'embed', timeoutMs = 30000 } = {}) {
  const t = resolveTier('embeddings');
  if (!t || !t.model) return null;
  const input = Array.isArray(texts) ? texts : [texts];
  try {
    const data = await rawCall(`${t.baseUrl}/embeddings`, t.apiKey, { model: t.model, input }, timeoutMs);
    recordUsage({ model: t.model, label, usage: data.usage });
    const rows = (data.data || []).slice().sort((a, b) => a.index - b.index);
    if (rows.length !== input.length) throw new Error(`expected ${input.length} vectors, got ${rows.length}`);
    return rows.map((r) => r.embedding);
  } catch (e) {
    console.error(`[llm:embed] ${e.message}`);
    return null;
  }
}

// Responses API call with the web_search tool — OpenAI-only (gated by the paper
// provider's webSearch flag; local providers return null immediately, which sends
// /compile down its honest no-citation path). Never throws to the caller.
export async function responsesWebSearch({ input, label = 'paper-search', timeoutMs = 60000 }) {
  const t = resolveTier('paper');
  if (!t || !t.flags.webSearch) return null;
  const body = { model: t.model, tools: [{ type: 'web_search' }], input };
  try {
    const data = await rawCall(`${t.baseUrl}/responses`, t.apiKey, body, timeoutMs);
    recordUsage({ model: t.model, label, usage: data.usage });
    const texts = [];
    const citations = [];
    for (const item of data.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) {
        if (c.type !== 'output_text') continue;
        texts.push(c.text || '');
        for (const a of c.annotations || []) {
          if (a.type === 'url_citation' && a.url) citations.push({ url: a.url, title: a.title || '' });
        }
      }
    }
    return { text: texts.join('\n'), citations, usage: data.usage };
  } catch (e) {
    console.error(`[llm:responses] ${e.message}`);
    return null;
  }
}

// Is the web_search tool usable on this key/model? True only if a probe returns
// at least one real URL citation. Lets /compile fall back to a no-citation,
// flag-everything mode rather than fabricating receipts.
export async function webSearchSelfTest() {
  const r = await responsesWebSearch({
    input: 'In one sentence, what is the Chatham House Rule? Cite a source.',
    label: 'paper-selftest',
    timeoutMs: 30000,
  });
  return !!(r && r.citations && r.citations.length);
}

// One-shot connectivity self-test for a tier, surfacing model/auth problems in the
// terminal (startup) or the settings UI (Test buttons), not in front of the room.
export async function selfTest(tier = 'fast') {
  if (tier === 'embeddings') {
    const v = await embed(['ping'], { label: 'selftest' });
    return !!(v && v[0] && v[0].length);
  }
  try {
    const r = await chatJSON({
      tier,
      system: 'Reply ONLY with JSON {"ok":true}.',
      user: 'ping',
      label: 'selftest',
      maxTokens: 20,
      timeoutMs: 15000,
    });
    return !!(r && r.ok);
  } catch {
    return false;
  }
}

// Human-readable tier map for /api/health and the startup log.
export function describeTiers() {
  const s = getSettings();
  const out = {};
  for (const [name, t] of Object.entries(s.tiers)) {
    const p = s.providers.find((x) => x.id === t.providerId);
    out[name] = `${t.model}${t.effort ? ` (effort ${t.effort})` : ''} @ ${p ? p.label : '⚠ unknown provider'}`;
  }
  return out;
}
