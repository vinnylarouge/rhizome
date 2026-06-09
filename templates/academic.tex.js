// academic.tex.js — the academic-paper template. Two columns, a Times-like serif
// (tgtermes), a spanning title via \maketitle, and an abstract block (rendered from
// the section with wrap='abstract'). Scholarly and dense. The Chatham House Rule is
// recorded via \nocite so it appears in the references as a method citation.

import { sharedPreamble } from './common.js';

export function documentTeX({ title, dateLine, bodyTeX, bibFile }) {
  return `\\documentclass[10pt,twocolumn,a4paper]{article}
\\usepackage[margin=0.85in]{geometry}
${sharedPreamble({ serif: 'tgtermes', sans: 'tgheros', bibFile })}
\\titleformat{\\section}{\\sffamily\\large\\bfseries\\color{accent}}{\\thesection}{0.6em}{}
\\titlespacing*{\\section}{0pt}{12pt}{4pt}
\\titleformat{\\subsection}{\\sffamily\\bfseries}{\\thesubsection}{0.5em}{}
\\setlength{\\parindent}{1.2em}
\\title{\\bfseries ${title}}
\\author{}
\\date{${dateLine} \\;\\textperiodcentered\\; under the Chatham House Rule}

\\begin{document}
\\maketitle
\\nocite{chathamhouserule}
${bodyTeX}

\\printbibliography[heading=bibintoc,title={References}]
\\end{document}
`;
}
