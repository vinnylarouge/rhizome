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

export const MODELS = { FAST, FAST_EFFORT, STRONG, STRONG_EFFORT };

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
export async function chatJSON({ tier = 'fast', system, user, label = 'worker', maxTokens = 700, timeoutMs = 30000 }) {
  const model = tier === 'strong' ? STRONG : FAST;
  const effort = tier === 'strong' ? STRONG_EFFORT : FAST_EFFORT;
  const body = {
    model,
    reasoning_effort: effort,
    response_format: { type: 'json_object' },
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
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
