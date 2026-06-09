// report.tex.js — the roundtable report template (single column, serif, side-rule
// headings, a Chatham House framing quote). documentTeX wraps the rendered body +
// a biblatex .bib. title/dateLine/framingNote arrive already LaTeX-escaped.

import { sharedPreamble, headingFormat, titleBlock } from './common.js';

export function documentTeX({ title, dateLine, framingNote, bodyTeX, bibFile }) {
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
${sharedPreamble({ serif: 'tgpagella', sans: 'tgheros', bibFile })}
${headingFormat()}
\\setlength{\\parskip}{0.5em}
\\setlength{\\parindent}{0pt}

\\begin{document}
${titleBlock({ kicker: 'Roundtable Report', title, dateLine })}
${framingNote ? `\\begin{quote}\\small\\itshape ${framingNote}\\end{quote}\\medskip\n` : ''}
${bodyTeX}

\\printbibliography[heading=bibintoc,title={References}]
\\end{document}
`;
}
