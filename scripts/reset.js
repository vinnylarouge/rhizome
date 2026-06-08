// reset.js — archive the current session and start clean. Run: `npm run reset`.
// Safe: it never deletes, it renames session.json/events.jsonl with a timestamp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

for (const f of ['session.json', 'events.jsonl', 'costs.jsonl']) {
  const p = path.join(DATA, f);
  if (fs.existsSync(p)) {
    const archived = path.join(DATA, `archive-${stamp}.${f}`);
    fs.renameSync(p, archived);
    console.log(`archived ${f} → ${path.basename(archived)}`);
  }
}
console.log('Session reset. Restart the server (npm start) for a clean board.');
