// common.js — shared LaTeX preamble pieces for the report templates. Uses pdflatex +
// the TeX Gyre font packages (tgpagella / tgheros / tgtermes) rather than
// xelatex+fontspec: same goal (proper book faces instead of Computer Modern) without
// the OS-font-discovery fragility. Defines an accent palette, a `loombox` callout
// (for policy-brief Key Findings / Recommendations), and tidy list spacing.

export function sharedPreamble({ serif = 'tgpagella', sans = 'tgheros', bibFile } = {}) {
  return `\\usepackage[T1]{fontenc}
\\usepackage{${serif}}
\\usepackage{${sans}}
\\usepackage{microtype}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\definecolor{accent}{HTML}{1F3A5F}
\\definecolor{accentlite}{HTML}{EAF0F7}
\\definecolor{rulegrey}{HTML}{C9D4E0}
\\usepackage[most]{tcolorbox}
\\usepackage{titlesec}
\\usepackage[colorlinks=true,linkcolor=accent,citecolor=accent,urlcolor=accent,breaklinks=true]{hyperref}
\\usepackage[backend=biber,style=numeric,sorting=none,maxbibnames=8]{biblatex}
\\addbibresource{${bibFile}}
\\newtcolorbox{loombox}[1]{colback=accentlite,colframe=accent,coltitle=white,fonttitle=\\sffamily\\bfseries,title=#1,boxrule=0.5pt,arc=2pt,left=9pt,right=9pt,top=7pt,bottom=7pt,breakable}
\\setlist{leftmargin=1.3em,itemsep=2pt,topsep=2pt}`;
}

// Numbered/coloured headings with a hairline rule under sections (report, academic).
export function headingFormat() {
  return `\\titleformat{\\section}{\\sffamily\\large\\bfseries\\color{accent}}{\\thesection}{0.6em}{}[{\\color{rulegrey}\\titlerule[0.5pt]}]
\\titlespacing*{\\section}{0pt}{14pt}{6pt}
\\titleformat{\\subsection}{\\sffamily\\bfseries\\color{accent!82!black}}{}{0em}{}
\\titlespacing*{\\subsection}{0pt}{9pt}{3pt}`;
}

// A custom title block for the single-column genres. `title`/`dateLine` arrive
// already LaTeX-escaped. Cites the Chatham House Rule once, here.
export function titleBlock({ kicker, title, dateLine }) {
  return `\\thispagestyle{empty}
\\begin{flushleft}
{\\sffamily\\small\\bfseries\\color{accent}\\MakeUppercase{${kicker}}}\\\\[3pt]
{\\fontsize{23}{27}\\selectfont\\bfseries ${title}}\\\\[8pt]
{\\color{rulegrey}\\rule{\\linewidth}{1.1pt}}\\\\[3pt]
{\\small ${dateLine} \\;\\textperiodcentered\\; held under the Chatham House Rule\\autocite{chathamhouserule}}
\\end{flushleft}
\\vspace{12pt}`;
}
