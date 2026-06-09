// genres.js — the parametric report genres. Each selects (a) which sections appear
// and their order/headings, (b) a voice preamble for the prose generator, (c) a LaTeX
// template + engine. The deterministic material for every possible section is built
// once in plan.js; a genre just chooses, orders, and renames — so the same findings
// can become "What We Heard" (brief), "Findings" (report), or "Findings" (paper).

export const DEFAULT_GENRE = 'policy-brief';

export const GENRES = {
  'policy-brief': {
    label: 'Policy brief',
    template: 'brief',
    engine: 'pdf',
    docKind: 'policy brief',
    voice:
      'This is a think-tank POLICY BRIEF for senior decision-makers who will skim before they ' +
      'read. Be direct, concrete, and confident; lead with what matters and what to do about it. ' +
      'Keep it tight but never clipped — every paragraph should earn a busy reader’s time and ' +
      'still read like a person wrote it.',
    layout: [
      { id: 'key-findings', heading: 'Key Findings', wrap: 'box' },
      { id: 'exec-summary', heading: 'Summary' },
      { id: 'about', heading: 'About This Brief' },
      { id: 'findings', heading: 'What We Heard' },
      { id: 'tensions', heading: 'Tensions and Trade-offs' },
      { id: 'evidence', heading: 'Evidence and Caveats' },
      { id: 'recommendations', heading: 'Recommendations', wrap: 'box' },
      { id: 'open-questions', heading: 'Open Questions' },
      { id: 'heuristics', heading: 'Thinking Tools Invoked' },
    ],
  },

  roundtable: {
    label: 'Roundtable report',
    template: 'report',
    engine: 'pdf',
    docKind: 'roundtable report',
    voice:
      'This is a Chatham House-style ROUNDTABLE REPORT. Write as a thoughtful rapporteur: warm, ' +
      'fair, and readable, synthesising a rich discussion into a record people will actually want ' +
      'to read. Let the argument develop over full paragraphs.',
    layout: [
      { id: 'exec-summary', heading: 'Executive Summary' },
      { id: 'intro', heading: 'Introduction' },
      { id: 'about', heading: 'About This Convening' },
      { id: 'findings', heading: 'Findings' },
      { id: 'tensions', heading: 'Tensions and Trade-offs' },
      { id: 'frames', heading: 'Conceptual Frames' },
      { id: 'evidence', heading: 'Evidence and Caveats' },
      { id: 'considerations', heading: 'Considerations and Emerging Principles' },
      { id: 'recommendations', heading: 'Recommendations' },
      { id: 'open-questions', heading: 'Open Questions' },
      { id: 'conclusion', heading: 'Conclusion' },
      { id: 'heuristics', heading: 'Appendix: Thinking Tools Invoked' },
    ],
  },

  academic: {
    label: 'Academic paper',
    template: 'academic',
    engine: 'pdf',
    docKind: 'academic paper',
    voice:
      'This is an ACADEMIC PAPER in the style of an AIES/FAccT contribution. The register is ' +
      'scholarly and measured but still readable: precise claims, careful framing, explicit about ' +
      'method and limits, third person throughout.',
    layout: [
      { id: 'abstract', heading: 'Abstract', wrap: 'abstract' },
      { id: 'intro', heading: 'Introduction' },
      { id: 'about', heading: 'Method' },
      { id: 'findings', heading: 'Findings' },
      { id: 'tensions', heading: 'Discussion' },
      { id: 'considerations', heading: 'Implications' },
      { id: 'evidence', heading: 'Limitations and Evidence' },
      { id: 'open-questions', heading: 'Open Questions' },
      { id: 'conclusion', heading: 'Conclusion' },
      { id: 'heuristics', heading: 'Appendix: Analytical Lenses' },
    ],
  },
};

export function resolveGenre(g) {
  return GENRES[g] ? g : DEFAULT_GENRE;
}
