// session-dir.js — where the post-session CLI scripts find sessions.
// Mirrors src/paths.js home resolution (RHIZOME_HOME, defaulting to ./data).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function sessionsRoot() {
  const home = process.env.RHIZOME_HOME || path.join(__dirname, '..', 'data');
  return path.join(home, 'sessions');
}

// The most recently touched session (same recency rule as the server's auto-open).
export function newestSessionDir() {
  let names = [];
  try { names = fs.readdirSync(sessionsRoot()); } catch { return null; }
  let best = null, bestM = -1;
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const f = path.join(sessionsRoot(), name, 'session.json');
    try {
      const m = fs.statSync(f).mtimeMs;
      if (m > bestM) { bestM = m; best = path.join(sessionsRoot(), name); }
    } catch { /* not a session dir */ }
  }
  return best;
}
