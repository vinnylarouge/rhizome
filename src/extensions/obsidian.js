// obsidian.js — Obsidian vault export (built-in extension).
// /obsidian writes the active session as linked Markdown into
// «vault»/Rhizome/<session-title>/ : an index note plus one note per non-empty
// theme, wikilinked along bridges. Re-export overwrites only this folder; the
// newest compiled PDF (if any) is copied alongside.

import fs from 'node:fs';
import path from 'node:path';
import { activeSessionDir } from '../paths.js';

// Obsidian-safe file name: no path separators or link-breaking characters.
const safe = (s) => (s || 'untitled').replace(/[\\/:#^|[\]"*?<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled';

const fm = (obj) =>
  '---\n' + Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n\n';

export async function exportSession(args, ctx) {
  const state = ctx.store.get();
  if (!state) return 'No active session to export';
  const vault = ctx.settings.get().extensions?.obsidian?.vaultPath;
  if (!vault) return 'Set the Obsidian vault folder in Settings first';
  if (!fs.existsSync(vault)) return `Vault folder not found: ${vault}`;

  const root = path.resolve(vault, 'Rhizome', safe(state.session.title));
  // Only ever write inside «vault»/Rhizome — refuse anything that escapes it.
  if (!root.startsWith(path.resolve(vault, 'Rhizome') + path.sep)) return 'Refusing to write outside the vault';
  fs.mkdirSync(root, { recursive: true });

  const noteById = new Map(state.notes.map((n) => [n.id, n]));
  const themeById = new Map(state.themes.map((t) => [t.id, t]));
  const text = (n) => n.clean || n.text;

  // Theme note filenames, deduped (two themes can sanitise to the same name).
  const fileNames = new Map();
  const used = new Set();
  const themes = state.themes.filter((t) => t.noteIds.length);
  for (const t of themes) {
    let name = safe(t.label);
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${safe(t.label)} ${i}`;
    used.add(name.toLowerCase());
    fileNames.set(t.id, name);
  }
  const wikilink = (themeId) => (fileNames.has(themeId) ? `[[${fileNames.get(themeId)}]]` : null);
  // A bridge endpoint can be a note — represent it by the first theme that holds it.
  const themeFor = (id) => (themeById.has(id) ? id : (noteById.get(id)?.themeIds || [])[0] || null);

  // Per-theme notes.
  const factsByNote = new Map((state.factChecks || []).map((f) => [f.noteId, f]));
  for (const t of themes) {
    const L = [fm({ rhizome: true, session: state.session.id, theme: t.label, kind: t.kind })];
    L.push(`# ${t.label}\n`);
    if (t.summary) L.push(`_${t.summary}_\n`);
    L.push('## Notes\n');
    for (const nid of t.noteIds) {
      const n = noteById.get(nid);
      if (!n) continue;
      L.push(`- ${n.derived ? '○ ' : ''}(${n.kind}) ${text(n)}`);
      if (n.elaboration) L.push(`  - ＋ ${n.elaboration}`);
      const f = factsByNote.get(nid);
      if (f) L.push(`  - ✓ ${f.verdict}: ${f.detail || f.statement}`);
    }
    const conns = [];
    for (const b of state.bridges || []) {
      const sa = themeFor(b.source), sb = themeFor(b.target);
      let other = null;
      if (sa === t.id && sb && sb !== t.id) other = sb;
      else if (sb === t.id && sa && sa !== t.id) other = sa;
      if (!other) continue;
      const link = wikilink(other);
      if (link) conns.push(`- **${b.type}** with ${link}${b.rationale ? ` — ${b.rationale}` : ''}`);
    }
    if (conns.length) L.push('\n## Connections\n', ...[...new Set(conns)]);
    fs.writeFileSync(path.join(root, fileNames.get(t.id) + '.md'), L.join('\n') + '\n');
  }

  // Index note.
  const L = [fm({
    rhizome: true,
    session: state.session.id,
    core: state.session.coreId,
    date: state.session.startedAt,
    notes: state.notes.filter((n) => !n.derived).length,
    themes: themes.length,
  })];
  L.push(`# ${state.session.title}\n`);
  L.push('## Themes\n');
  for (const t of themes) L.push(`- [[${fileNames.get(t.id)}]] (${t.noteIds.length} notes)`);
  if ((state.frames || []).length) {
    L.push('\n## Abstractions\n');
    for (const f of state.frames) L.push(`- **${f.name}** (${f.frameKind})${f.gist ? ` — ${f.gist}` : ''}`);
  }
  if ((state.generalisations || []).length) {
    L.push('\n## Principles\n');
    for (const g of state.generalisations) L.push(`- ${g.principle}`);
  }

  // Newest compiled PDF, copied in and linked.
  const papersDir = activeSessionDir() && path.join(activeSessionDir(), 'papers');
  let pdfNote = '';
  if (papersDir && fs.existsSync(papersDir)) {
    const pdfs = fs.readdirSync(papersDir)
      .map((d) => path.join(papersDir, d, d + '.pdf'))
      .filter((p) => fs.existsSync(p))
      .sort();
    if (pdfs.length) {
      const newest = pdfs[pdfs.length - 1];
      const target = path.join(root, path.basename(newest));
      fs.copyFileSync(newest, target);
      L.push(`\n## Report\n- [[${path.basename(newest)}]]`);
      pdfNote = ' + report PDF';
    }
  }
  const indexName = safe(state.session.title);
  fs.writeFileSync(path.join(root, indexName + '.md'), L.join('\n') + '\n');

  return `Exported ${themes.length} theme notes${pdfNote} → ${path.join('Rhizome', indexName)}`;
}

export const extension = {
  id: 'obsidian',
  name: 'Obsidian export',
  settingsSchema: [{ key: 'vaultPath', label: 'Obsidian vault folder', type: 'folder' }],
  commands: {
    '/obsidian': { hint: 'Export this session to the Obsidian vault', handler: exportSession },
  },
};
