// report.tex.js — the committed LaTeX skeleton for a Chatham House-style roundtable
// report. This is the typeset "grammar" made concrete: documentTeX() wraps the
// generated section prose (already TeX-ready) plus a biblatex .bib of receipts.
//
// Single-column, authoryear citations via biber, hyperref so every reference URL is
// a clickable receipt. Kept hand-editable on purpose — the template is a control
// surface, not a black box (mirrors how Loom vendors its heuristic docs as files).

export function documentTeX({ title, dateLine, framingNote, bodyTeX, bibFile }) {
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage[colorlinks=true,linkcolor=black,citecolor={blue!55!black},urlcolor={blue!50!black},breaklinks=true]{hyperref}
\\usepackage[backend=biber,style=numeric,sorting=none,maxbibnames=6]{biblatex}
\\addbibresource{${bibFile}}

\\setlength{\\parskip}{0.5em}
\\setlength{\\parindent}{0pt}
\\setlist{nosep,leftmargin=1.4em}

\\title{${title}}
\\author{}
\\date{${dateLine}}

\\begin{document}
\\maketitle
${framingNote ? `\n\\begin{quote}\\small\\itshape\n${framingNote} \\autocite{chathamhouserule}\n\\end{quote}\n` : ''}
${bodyTeX}

\\printbibliography[heading=bibintoc,title={References}]
\\end{document}
`;
}
