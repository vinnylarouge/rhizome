// cores.js — discussion cores. A core is everything discussion-type-specific that
// used to be hardcoded: seed anchors, the note-kind taxonomy, worker prompts, what
// abduction surfaces, and how /compile maps material. Bundled cores live in the repo
// (cores/<id>/core.json); on first run they're seeded to RHIZOME_HOME/cores/ where
// users can edit or add their own without touching app code.

import fs from 'node:fs';
import path from 'node:path';
import { home, repoRoot } from './paths.js';

const bundledDir = () => path.join(repoRoot(), 'cores');
const userDir = () => path.join(home(), 'cores');

const REQUIRED_PROMPTS = ['triage', 'bridges', 'heuristic', 'factcheck', 'abduct', 'abstract', 'elaborate', 'mergeThemes', 'mergeFrames', 'chunk'];
const DEFAULT_TRIO = ['#4ea0e0', '#e8943b', '#b483e6']; // protanopia-safe blue/orange/violet

export function validate(core) {
  const errs = [];
  if (!core || typeof core !== 'object') return ['not an object'];
  if (!core.id) errs.push('missing id');
  if (!core.name) errs.push('missing name');
  if (!Array.isArray(core.anchors) || !core.anchors.length) errs.push('missing anchors');
  else for (const a of core.anchors) if (!a.id || !a.label || !a.parent) errs.push('anchor missing id/label/parent');
  if (!Array.isArray(core.kinds) || !core.kinds.length) errs.push('missing kinds');
  for (const p of REQUIRED_PROMPTS) {
    if (!core.prompts || typeof core.prompts[p] !== 'string') errs.push(`missing prompts.${p}`);
  }
  return errs;
}

// Copy bundled cores into the user dir — only ones not already there, so user
// edits are never clobbered by an app update.
export function seed() {
  fs.mkdirSync(userDir(), { recursive: true });
  let names = [];
  try { names = fs.readdirSync(bundledDir()); } catch { return; }
  for (const name of names) {
    const src = path.join(bundledDir(), name, 'core.json');
    const dstDir = path.join(userDir(), name);
    if (!fs.existsSync(src) || fs.existsSync(path.join(dstDir, 'core.json'))) continue;
    fs.mkdirSync(dstDir, { recursive: true });
    fs.copyFileSync(src, path.join(dstDir, 'core.json'));
  }
}

function readCore(dir, id) {
  try {
    const core = JSON.parse(fs.readFileSync(path.join(dir, id, 'core.json'), 'utf8'));
    return validate(core).length ? null : core;
  } catch {
    return null;
  }
}

// User copy first; an invalid/corrupt user edit falls back to the bundled copy
// (loudly), so a typo in a JSON file can never take the board down.
export function get(id) {
  const user = readCore(userDir(), id);
  if (user) return withColors(user);
  const bundled = readCore(bundledDir(), id);
  if (bundled) {
    if (fs.existsSync(path.join(userDir(), id, 'core.json'))) {
      console.error(`[cores] user core "${id}" is invalid — using the bundled copy. Errors: fix ${path.join(userDir(), id, 'core.json')}`);
    }
    return withColors(bundled);
  }
  return null;
}

function withColors(core) {
  core.anchors = core.anchors.map((a, i) => ({ ...a, color: a.color || DEFAULT_TRIO[i % DEFAULT_TRIO.length] }));
  return core;
}

export function list() {
  const ids = new Set();
  for (const dir of [userDir(), bundledDir()]) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (fs.existsSync(path.join(dir, name, 'core.json'))) ids.add(name);
      }
    } catch { /* dir may not exist */ }
  }
  return [...ids]
    .map((id) => get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, description: c.description || '' }));
}

// The active core follows the open session (set by store.load / openSession).
let active = null;
export function setActive(core) { active = core; }
export function activeCore() { return active; }

// Expand a core prompt's placeholders: {{kinds}} → "a"|"b"|… and
// {{anchorLabels}} → ["A","B",…], so taxonomy edits propagate into prompts.
export function renderPrompt(core, name) {
  const kinds = core.kinds.map((k) => `"${k}"`).join('|');
  const anchorLabels = JSON.stringify(core.anchors.map((a) => a.label));
  return core.prompts[name].replaceAll('{{kinds}}', kinds).replaceAll('{{anchorLabels}}', anchorLabels);
}

// What the browser needs to render a core: anchors with parents and colours.
export function clientSummary(core) {
  return {
    id: core.id,
    name: core.name,
    anchors: core.anchors.map(({ id, label, parent, color }) => ({ id, label, parent, color })),
  };
}
