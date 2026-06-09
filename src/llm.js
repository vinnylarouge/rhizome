// llm.js — minimal OpenAI chat-completions client over native fetch.
// No SDK: we send the exact payload shape we verified works for gpt-5.4(-mini),
// so there is no SDK-version risk. Always returns parsed JSON or null (never throws
// up to the workers — a failed enrichment must never break note-taking).

import { recordUsage } from './cost.js';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const FAST = process.env.LOOM_FAST_MODEL || 'gpt-5.4-mini';
const FAST_EFFORT = process.env.LOOM_FAST_EFFORT || 'none';
const STRONG = process.env.LOOM_STRONG_MODEL || 'gpt-5.4';
const STRONG_EFFORT = process.env.LOOM_STRONG_EFFORT || 'low';
// Paper pipeline (/compile) model — stronger than the live workers, and the one
// with the web_search tool for citation receipts. Live workers stay on gpt-5.4.
const PAPER = process.env.LOOM_PAPER_MODEL || 'gpt-5.5';
const PAPER_EFFORT = process.env.LOOM_PAPER_EFFORT || 'low';

export const MODELS = { FAST, FAST_EFFORT, STRONG, STRONG_EFFORT, PAPER, PAPER_EFFORT };
const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

async function rawCall(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content ?? '', usage: data.usage };
  } finally {
    clearTimeout(timer);
  }
}

// chatJSON: ask a model for a single JSON object. `tier` is 'fast' | 'strong'.
// Returns the parsed object, or null on any failure (logged, never thrown).
export async function chatJSON({ tier = 'fast', model: modelOverride, effort: effortOverride, system, user, label = 'worker', maxTokens = 700, timeoutMs = 30000 }) {
  const model = modelOverride || (tier === 'strong' ? STRONG : FAST);
  const effort = effortOverride || (modelOverride ? PAPER_EFFORT : tier === 'strong' ? STRONG_EFFORT : FAST_EFFORT);
  // OpenAI's json_object response_format requires the literal word "json" somewhere
  // in the messages; guard so a prompt that forgets it can't 400 and silently drop output.
  const sys = /json/i.test(system) || /json/i.test(user) ? system : `${system}\nRespond with a single JSON object.`;
  const body = {
    model,
    reasoning_effort: effort,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, usage } = await rawCall(body, timeoutMs);
      recordUsage({ model, label, usage });
      return JSON.parse(content);
    } catch (e) {
      if (attempt === 0) continue; // one quiet retry
      console.error(`[llm:${model}] ${e.message}`);
      return null;
    }
  }
  return null;
}

// Responses API call with the web_search tool. Returns { text, citations:
// [{url,title}], usage } or null. This is how the citation agency gets real,
// grounded source URLs ("receipts") server-side. Never throws to the caller.
export async function responsesWebSearch({ input, model = PAPER, label = 'paper-search', timeoutMs = 60000 }) {
  const body = { model, tools: [{ type: 'web_search' }], input };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(RESPONSES_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    recordUsage({ model, label, usage: data.usage });
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
  } finally {
    clearTimeout(timer);
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

// One-shot connectivity self-test at startup so model/auth problems surface
// in the terminal, not in front of the room.
export async function selfTest() {
  try {
    const r = await chatJSON({
      tier: 'fast',
      system: 'Reply ONLY with JSON {"ok":true}.',
      user: 'ping',
      maxTokens: 20,
      timeoutMs: 15000,
    });
    return !!(r && r.ok);
  } catch {
    return false;
  }
}
