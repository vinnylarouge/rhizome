// heuristics.js — load the vendored heuristics vault and expose a compact catalog
// plus a lookup. Matching itself is done by the LLM (workers.js) reranking this
// catalog; no embeddings, so it stays dependency-free and offline-parseable.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(__dirname, '..', 'heuristics');

const byId = new Map();

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { fm: {}, body: src };
  const fm = {};
  const body = src.slice(m[0].length);
  // Tiny YAML-ish parser: only the keys we need (id, name, tags list).
  const lines = m[1].split('\n');
  let curKey = null;
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) {
      curKey = kv[1];
      const val = kv[2].trim();
      if (val && val !== '') fm[curKey] = val.replace(/^["']|["']$/g, '');
      else fm[curKey] = [];
    } else if (curKey && /^\s*-\s+/.test(line)) {
      if (!Array.isArray(fm[curKey])) fm[curKey] = [];
      fm[curKey].push(line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, ''));
    }
  }
  return { fm, body };
}

function extractPrinciple(body) {
  // The vault uses a leading blockquote with bold text as the one-line principle.
  const m = body.match(/^\s*>\s*\*\*(.+?)\*\*/m);
  return m ? m[1].trim() : '';
}

function extractSection(body, heading) {
  const re = new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, 'i');
  const m = body.match(re);
  if (!m) return [];
  return m[1]
    .split('\n')
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean);
}

export function loadHeuristics() {
  byId.clear();
  let files = [];
  try {
    files = fs.readdirSync(VAULT).filter((f) => f.endsWith('.md') && f !== 'README.md');
  } catch (e) {
    console.error('[heuristics] vault not found:', e.message);
    return [];
  }
  for (const file of files) {
    const src = fs.readFileSync(path.join(VAULT, file), 'utf8');
    const { fm, body } = parseFrontmatter(src);
    const id = fm.id || file.replace(/\.md$/, '');
    const tags = Array.isArray(fm.tags) ? fm.tags : [];
    const hooks = tags.filter((t) => t.startsWith('hook/')).map((t) => t.replace('hook/', ''));
    const entry = {
      id,
      name: fm.name || id,
      hooks,
      principle: extractPrinciple(body),
      questions: extractSection(body, 'Questions it forces'),
      whatToDo: extractSection(body, 'What to do'),
    };
    byId.set(id, entry);
  }
  console.log(`[heuristics] loaded ${byId.size} heuristics`);
  return [...byId.values()];
}

export function getHeuristic(id) {
  return byId.get(id) || null;
}

// Compact catalog string for the LLM matcher prompt: one line per heuristic.
export function catalog() {
  return [...byId.values()]
    .map((h) => `${h.id} | ${h.name} | fires:${h.hooks.join(',')} | ${h.principle}`)
    .join('\n');
}
