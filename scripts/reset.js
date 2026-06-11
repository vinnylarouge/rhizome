// reset.js — archive the most recent session so the next start is a clean board.
// Run: `npm run reset`. Safe: it never deletes — the session moves (files intact)
// to sessions/.archive/, exactly like Archive in the in-app library.
import fs from 'node:fs';
import path from 'node:path';
import { newestSessionDir, sessionsRoot } from './session-dir.js';

const dir = newestSessionDir();
if (!dir) { console.log('No sessions to reset.'); process.exit(0); }
const id = path.basename(dir);
const dst = path.join(sessionsRoot(), '.archive', id);
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.renameSync(dir, dst);
console.log(`archived session ${id} → sessions/.archive/${id}`);
console.log('Next start shows the session library (or resumes the next-newest session).');
