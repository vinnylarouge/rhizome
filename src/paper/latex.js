// latex.js — assemble a finished paper (title + TeX-ready section bodies + receipts)
// into .tex + .bib and compile to PDF with latexmk. No LLM here: pure string assembly
// + a child-process compile. The template is chosen by genre (doc.template); sections
// carry a `wrap` hint (section / box / abstract) that controls how each is framed.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { documentTeX as reportTeX } from '../../templates/report.tex.js';
import { documentTeX as briefTeX } from '../../templates/brief.tex.js';
import { documentTeX as academicTeX } from '../../templates/academic.tex.js';

const pexec = promisify(execFile);
const TEMPLATES = { report: reportTeX, brief: briefTeX, academic: academicTeX };
const ENGINE_FLAG = { pdf: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex' };

const ESC = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
// Escape arbitrary text for LaTeX. Apply to model/user text BEFORE inserting
// \cite{}/\autocite{} markers (whose braces must NOT be escaped).
export function escapeTeX(s = '') {
  return String(s).replace(/[\\&%$#_{}~^]/g, (c) => ESC[c]);
}

// Build a biblatex .bib from receipt records. Name fields get an extra brace pair so
// biber treats the value as one literal unit — web-extracted author lists are
// comma-separated and would otherwise trip biber's "too many commas" parser.
export function toBib(references = []) {
  const field = (k, v) => (v ? `  ${k} = {${String(v).replace(/[{}]/g, '')}},\n` : '');
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

// sections: [{ heading, body, wrap }] where body is ALREADY TeX-ready.
function renderBody(sections = []) {
  return sections
    .map((s) => {
      if (s.wrap === 'box') return `\\begin{loombox}{${escapeTeX(s.heading)}}\n${s.body}\n\\end{loombox}`;
      if (s.wrap === 'abstract') return `\\begin{abstract}\n${s.body}\n\\end{abstract}`;
      return `\\section{${escapeTeX(s.heading)}}\n${s.body}`;
    })
    .join('\n\n');
}

// Assemble the .tex + .bib strings from a finished paper document.
export function assemble({ title, dateLine, framingNote, sections, references, template }) {
  const bibFile = 'paper.bib';
  const docTeX = TEMPLATES[template] || TEMPLATES.report;
  const tex = docTeX({
    title: escapeTeX(title || 'Report'),
    dateLine: escapeTeX(dateLine || ''),
    framingNote: framingNote ? escapeTeX(framingNote) : '',
    bodyTeX: renderBody(sections),
    bibFile,
  });
  return { tex, bib: toBib(references), bibFile };
}

// Write .tex/.bib into outDir/<stem>/ and compile with latexmk (which runs biber
// automatically). Engine from doc.engine (pdf | xelatex | lualatex). Returns
// { ok, texPath, pdfPath, dir, log }.
export async function compile(doc, { outDir, stem }) {
  const dir = path.join(outDir, stem);
  fs.mkdirSync(dir, { recursive: true });
  const { tex, bib, bibFile } = assemble(doc);
  const texPath = path.join(dir, `${stem}.tex`);
  fs.writeFileSync(texPath, tex);
  fs.writeFileSync(path.join(dir, bibFile), bib);

  const flag = ENGINE_FLAG[doc.engine] || '-pdf';
  let ok = true;
  let log = '';
  try {
    const { stdout, stderr } = await pexec(
      'latexmk',
      [flag, '-interaction=nonstopmode', '-halt-on-error', `${stem}.tex`],
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
