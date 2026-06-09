// brief.tex.js — the policy-brief template (default). Single column, unnumbered
// sans headings, with the Key Findings and Recommendations sections rendered as
// `loombox` callouts (set via the section's wrap='box'). Punchy, executive-facing.
// A true left sidebar is fragile in LaTeX; a prominent top callout box reads the
// same way and compiles reliably.

import { sharedPreamble, headingFormat, titleBlock } from './common.js';

export function documentTeX({ title, dateLine, bodyTeX, bibFile }) {
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=0.9in]{geometry}
${sharedPreamble({ serif: 'tgpagella', sans: 'tgheros', bibFile })}
${headingFormat()}
\\setcounter{secnumdepth}{0}
\\setlength{\\parskip}{0.5em}
\\setlength{\\parindent}{0pt}

\\begin{document}
${titleBlock({ kicker: 'Policy Brief', title, dateLine })}
${bodyTeX}

\\printbibliography[heading=bibintoc,title={References}]
\\end{document}
`;
}
