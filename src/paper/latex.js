// latex.js — assemble a finished paper (title + TeX-ready section bodies + receipts)
// into .tex + .bib and compile to PDF with latexmk. No LLM here: pure string
// assembly + a child-process compile. Kept deterministic and testable.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { documentTeX } from '../../templates/report.tex.js';

const pexec = promisify(execFile);

const ESC = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
// Escape arbitrary text for LaTeX. Apply to every piece of model/user text BEFORE
// inserting \cite{}/\autocite{} markers (whose braces must NOT be escaped).
export function escapeTeX(s = '') {
  return String(s).replace(/[\\&%$#_{}~^]/g, (c) => ESC[c]);
}

// Build a biblatex .bib from receipt records. Each: {key, type?, author?, title,
// year?, url, urldate?, note?, journal?, publisher?}. Defaults to @online — the
// honest entry type for a fetched web receipt.
export function toBib(references = []) {
  const field = (k, v) => (v ? `  ${k} = {${String(v).replace(/[{}]/g, '')}},\n` : '');
  // Name fields get an extra brace pair so biber treats the whole value as one
  // literal unit — web-extracted author lists are comma-separated ("First Last,
  // First Last, ...") and would otherwise trip biber's "too many commas" parser.
  const nameField = (k, v) => (v ? `  ${k} = {{${String(v).replace(/[{}]/g, '')}}},\n` : '');
  return references
    .map((r) => {
      const type = r.type || 'online';
      let s = `@${type}{${r.key},\n`;
      s += nameField('author', r.author);
      s += field('title', r.title);
      s += field('year', r.year);
      s += field('journal', r.journal);
      s += field('publisher', r.publisher);
      s += field('url', r.url);
      s += field('urldate', r.urldate);
      s += field('note', r.note);
      s += '}\n';
      return s;
    })
    .join('\n');
}

// sections: [{ heading, body }] where body is ALREADY TeX-ready (escaped + cites).
function renderBody(sections = []) {
  return sections.map((s) => `\\section{${escapeTeX(s.heading)}}\n${s.body}\n`).join('\n');
}

// Assemble the .tex + .bib strings from a finished paper document.
export function assemble({ title, dateLine, framingNote, sections, references }) {
  const bibFile = 'paper.bib';
  const tex = documentTeX({
    title: escapeTeX(title || 'Roundtable Report'),
    dateLine: escapeTeX(dateLine || ''),
    framingNote: framingNote ? escapeTeX(framingNote) : '',
    bodyTeX: renderBody(sections),
    bibFile,
  });
  return { tex, bib: toBib(references), bibFile };
}

// Write .tex/.bib into outDir/<stem>/ and compile with latexmk (which runs biber
// automatically for biblatex). Returns { ok, texPath, pdfPath, dir, log }.
export async function compile(doc, { outDir, stem }) {
  const dir = path.join(outDir, stem);
  fs.mkdirSync(dir, { recursive: true });
  const { tex, bib, bibFile } = assemble(doc);
  const texPath = path.join(dir, `${stem}.tex`);
  fs.writeFileSync(texPath, tex);
  fs.writeFileSync(path.join(dir, bibFile), bib);

  let ok = true;
  let log = '';
  try {
    const { stdout, stderr } = await pexec(
      'latexmk',
      ['-pdf', '-interaction=nonstopmode', '-halt-on-error', `${stem}.tex`],
      { cwd: dir, timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    );
    log = stdout + stderr;
  } catch (e) {
    ok = false;
    log = (e.stdout || '') + (e.stderr || '') + (e.message || '');
  }
  const pdfPath = path.join(dir, `${stem}.pdf`);
  ok = ok && fs.existsSync(pdfPath);
  return { ok, texPath, pdfPath: ok ? pdfPath : null, dir, log };
}
