// paths.js — owns RHIZOME_HOME resolution and the active-session-dir registry.
// Lives below everything else (no imports from src/) so store.js and cost.js can
// both use it without creating an import cycle.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  return path.join(__dirname, '..');
}

// User-data home. Electron sets RHIZOME_HOME to app.getPath('userData');
// headless dev defaults to ./data so the repo stays self-contained.
// Resolved per-call (cheap) so tests can swap homes via the env var.
export function home() {
  const h = process.env.RHIZOME_HOME || path.join(repoRoot(), 'data');
  fs.mkdirSync(h, { recursive: true });
  return h;
}

// Where the currently-open session's files live (set by store.js on open/create).
// cost.js falls back to home() when no session is active (e.g. settings test calls).
let _activeSessionDir = null;
export function setActiveSessionDir(p) { _activeSessionDir = p; }
export function activeSessionDir() { return _activeSessionDir; }

// Tiny .env loader (no dependency), moved verbatim from server.js. Looks in the
// repo root; existing process.env always wins.
export function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(repoRoot(), '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {
    /* .env optional if vars already in environment */
  }
}
