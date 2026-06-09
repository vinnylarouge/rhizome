// plan.js — the deterministic linearizer. state -> paperPlan (pure, no network).
// Implements the ordered grammar in docs/paper-grammar.md: slots graph elements
// into sections, ranks themes by salience, resolves references, suppresses empty
// sections. Same state in -> same plan out, so it is unit-testable in isolation.
//
// The output paperPlan carries *structured material* per section (not prose). The
// citation agency (cite.js) decorates the cite-bearing sections; the prose
// generator (style.js) turns each section's material into text in the prescribed
// voice. Sections marked cite:true (evidence, heuristics) carry external receipts.

const DEFAULT_PARTICIPANTS = 'executives, university leaders, and senior military officers';

// The one fixed citation (directly verifiable), not produced by the agency.
export const CHATHAM_RULE_CITATION = {
  key: 'chathamhouserule',
  type: 'online',
  author: 'Chatham House',
  title: 'The Chatham House Rule',
  year: '2024',
  url: 'https://www.chathamhouse.org/about-us/chatham-house-rule',
  note: 'Royal Institute of International Affairs',
};

const CHATHAM_RULE_TEXT =
  'When a meeting, or part thereof, is held under the Chatham House Rule, ' +
  'participants are free to use the information received, but neither the identity ' +
  'nor the affiliation of the speaker(s), nor that of any other participant, may be revealed.';

const text = (n) => (n && (n.clean || n.text)) || '';

export function buildPlan(state, opts = {}) {
  const notes = state.notes || [];
  const themes = state.themes || [];
  const bridges = state.bridges || [];
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const themeById = new Map(themes.map((t) => [t.id, t]));
  const emergent = themes.filter((t) => t.kind !== 'anchor');

  const label = (id) =>
    noteById.has(id) ? text(noteById.get(id)) : themeById.has(id) ? themeById.get(id).label : id;
  const kindOf = (id) => (noteById.has(id) ? 'note' : themeById.has(id) ? 'theme' : 'unknown');

  // theme salience = note count + bridge degree (touched by more links -> ranks higher)
  const degree = new Map();
  for (const b of bridges) {
    degree.set(b.source, (degree.get(b.source) || 0) + 1);
    degree.set(b.target, (degree.get(b.target) || 0) + 1);
  }
  const salience = (t) => (t.noteIds?.length || 0) + (degree.get(t.id) || 0);
  const rankedThemes = [...emergent].sort((a, b) => salience(b) - salience(a));

  const valueNotes = notes.filter((n) => n.parent === 'values' || n.kind === 'value');
  const painNotes = notes.filter((n) => n.parent === 'painpoints' || n.kind === 'painpoint');
  const questionNotes = notes.filter((n) => n.kind === 'question');
  const generalisations = state.generalisations || [];
  const boundaries = state.boundaryConditions || [];

  const tensionItems = bridges
    .filter((b) => b.type === 'tension')
    .map((b) => ({
      a: label(b.source), aKind: kindOf(b.source),
      b: label(b.target), bKind: kindOf(b.target),
      rationale: b.rationale || '',
    }));
  const otherLinks = bridges
    .filter((b) => b.type === 'echoes' || b.type === 'causes')
    .map((b) => ({ type: b.type, a: label(b.source), b: label(b.target), rationale: b.rationale || '' }));

  // findings by theme (ranked); keep to what was actually said (drop derived notes)
  const findings = rankedThemes
    .map((t) => ({
      label: t.label,
      summary: t.summary || '',
      notes: (t.noteIds || [])
        .map((id) => noteById.get(id))
        .filter((n) => n && !n.derived)
        .map((n) => ({ text: text(n), kind: n.kind })),
      principles: generalisations
        .filter((g) => (g.coheresWith || []).some((c) => c.toLowerCase() === t.label.toLowerCase()))
        .map((g) => g.principle),
    }))
    .filter((f) => f.notes.length);

  // evidence & caveats (cite-bearing): factChecks + matching boundary condition
  const evidence = (state.factChecks || []).map((f) => ({
    noteId: f.noteId,
    statement: f.statement,
    verdict: f.verdict,
    detail: f.detail || '',
    boundary: (boundaries.find((b) => b.noteId === f.noteId) || {}).text || '',
    sourceNote: text(noteById.get(f.noteId)),
  }));

  const frames = (state.frames || []).map((fr) => ({
    name: fr.name,
    kind: fr.frameKind || 'frame',
    gist: fr.gist || '',
    themes: (fr.themeIds || []).map((id) => (themeById.get(id) || {}).label).filter(Boolean),
  }));

  const considerations = generalisations.map((g) => ({ principle: g.principle, coheresWith: g.coheresWith || [] }));

  // heuristics appendix (cite-bearing provenance), deduped by name
  const seenH = new Set();
  const heuristics = (state.heuristicHits || [])
    .map((h) => ({ name: h.name, principle: h.principle, why: h.why || '', prompt: text(noteById.get(h.noteId)) }))
    .filter((h) => (seenH.has(h.name) ? false : seenH.add(h.name)));

  const openQuestions = questionNotes.map((n) => ({ text: text(n), derived: !!n.derived }));

  const dateLine = opts.dateLine || formatDate(state.session?.startedAt);
  const participants = opts.participants || state.session?.participants || DEFAULT_PARTICIPANTS;
  const title = state.session?.title || 'Live Discussion';

  const meta = {
    noteCount: notes.filter((n) => !n.derived).length,
    derivedCount: notes.filter((n) => n.derived).length,
    themeCount: emergent.length,
    bridgeCount: bridges.length,
    participants,
    seedThemes: ['values', 'painpoints'],
    dateLine,
    synthesisDisclaimer:
      'Findings and recommendations reflect the rapporteur’s synthesis of the discussion, ' +
      'not direct endorsements by any individual participant.',
  };

  // aggregate material for the synthesized sections (exec summary / intro / recs / conclusion)
  const aggregate = {
    title,
    topThemes: rankedThemes.slice(0, 5).map((t) => ({ label: t.label, summary: t.summary || '', notes: (t.noteIds || []).length })),
    values: valueNotes.filter((n) => !n.derived).map((n) => text(n)),
    painpoints: painNotes.filter((n) => !n.derived).map((n) => text(n)),
    tensions: tensionItems,
    principles: considerations.map((c) => c.principle),
    openQuestions: openQuestions.map((q) => q.text),
  };

  const S = [];
  const add = (id, heading, role, cite, present, material) =>
    S.push({ id, heading, role, cite: !!cite, present: !!present, material });

  add('exec-summary', 'Executive Summary', 'summary', false, true, aggregate); // synthesized, written last
  add('intro', 'Introduction', 'framing', false, true, { title, values: aggregate.values, painpoints: aggregate.painpoints, centralTension: tensionItems[0] || null });
  add('about', 'About This Convening', 'method', false, true, { ...meta });
  add('findings', 'Findings', 'body', false, findings.length > 0, { themes: findings });
  add('tensions', 'Tensions and Trade-offs', 'tensions', false, tensionItems.length > 0, { tensions: tensionItems, otherLinks });
  add('frames', 'Conceptual Frames', 'frames', false, frames.length > 0, { frames });
  add('evidence', 'Evidence and Caveats', 'evidence', true, evidence.length > 0, { items: evidence });
  add('considerations', 'Considerations and Emerging Principles', 'considerations', false, considerations.length > 0, { principles: considerations });
  add('recommendations', 'Recommendations', 'recommendations', false, true, { values: aggregate.values, painpoints: aggregate.painpoints, principles: aggregate.principles, tensions: tensionItems });
  add('open-questions', 'Open Questions', 'questions', false, openQuestions.length > 0, { items: openQuestions });
  add('conclusion', 'Conclusion', 'conclusion', false, true, { title });
  add('heuristics', 'Appendix: Thinking Tools Invoked', 'appendix', true, heuristics.length > 0, { items: heuristics });

  return {
    title,
    dateLine,
    framingNote: `${CHATHAM_RULE_TEXT}  This record does not express opinions of its own; the views summarised are those of participants, synthesised under the Rule.`,
    meta,
    fixedCitations: [CHATHAM_RULE_CITATION],
    aggregate,
    sections: S.filter((s) => s.present),
  };
}

function formatDate(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}
