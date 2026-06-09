// plan.js — the deterministic linearizer. state -> paperPlan (pure, no network).
// Builds the structured *material* for every possible section once, then a genre
// (genres.js) chooses which sections appear, in what order, under what headings.
// Same state + genre in -> same plan out, so it is unit-testable in isolation.

import { GENRES, resolveGenre, DEFAULT_GENRE } from './genres.js';

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

  // theme salience = note count + bridge degree
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
    .map((b) => ({ a: label(b.source), aKind: kindOf(b.source), b: label(b.target), bKind: kindOf(b.target), rationale: b.rationale || '' }));
  const otherLinks = bridges
    .filter((b) => b.type === 'echoes' || b.type === 'causes')
    .map((b) => ({ type: b.type, a: label(b.source), b: label(b.target), rationale: b.rationale || '' }));

  const findings = rankedThemes
    .map((t) => ({
      label: t.label,
      summary: t.summary || '',
      notes: (t.noteIds || []).map((id) => noteById.get(id)).filter((n) => n && !n.derived).map((n) => ({ text: text(n), kind: n.kind })),
      principles: generalisations.filter((g) => (g.coheresWith || []).some((c) => c.toLowerCase() === t.label.toLowerCase())).map((g) => g.principle),
    }))
    .filter((f) => f.notes.length);

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
      'Findings and recommendations reflect the rapporteur’s synthesis of the discussion, not direct endorsements by any individual participant.',
  };

  const aggregate = {
    title,
    topThemes: rankedThemes.slice(0, 5).map((t) => ({ label: t.label, summary: t.summary || '', notes: (t.noteIds || []).length })),
    values: valueNotes.filter((n) => !n.derived).map((n) => text(n)),
    painpoints: painNotes.filter((n) => !n.derived).map((n) => text(n)),
    tensions: tensionItems,
    principles: considerations.map((c) => c.principle),
    openQuestions: openQuestions.map((q) => q.text),
  };

  // Material for every possible section. A genre picks from these by id.
  const slots = {
    abstract: { role: 'abstract', cite: false, material: aggregate, present: true },
    'key-findings': { role: 'key-findings', cite: false, material: { topThemes: aggregate.topThemes, principles: aggregate.principles, tensions: tensionItems, painpoints: aggregate.painpoints }, present: findings.length > 0 || considerations.length > 0 },
    'exec-summary': { role: 'summary', cite: false, material: aggregate, present: true },
    intro: { role: 'framing', cite: false, material: { title, values: aggregate.values, painpoints: aggregate.painpoints, centralTension: tensionItems[0] || null }, present: true },
    about: { role: 'method', cite: false, material: { ...meta }, present: true },
    findings: { role: 'body', cite: false, material: { themes: findings }, present: findings.length > 0 },
    tensions: { role: 'tensions', cite: false, material: { tensions: tensionItems, otherLinks }, present: tensionItems.length > 0 },
    frames: { role: 'frames', cite: false, material: { frames }, present: frames.length > 0 },
    evidence: { role: 'evidence', cite: true, material: { items: evidence }, present: evidence.length > 0 },
    considerations: { role: 'considerations', cite: false, material: { principles: considerations }, present: considerations.length > 0 },
    recommendations: { role: 'recommendations', cite: false, material: { values: aggregate.values, painpoints: aggregate.painpoints, principles: considerations.map((c) => c.principle), tensions: tensionItems }, present: true },
    'open-questions': { role: 'questions', cite: false, material: { items: openQuestions }, present: openQuestions.length > 0 },
    conclusion: { role: 'conclusion', cite: false, material: { title }, present: true },
    heuristics: { role: 'appendix', cite: true, material: { items: heuristics }, present: heuristics.length > 0 },
  };

  const genre = resolveGenre(opts.genre);
  const G = GENRES[genre];
  const sections = G.layout
    .map(({ id, heading, wrap }) => {
      const s = slots[id];
      return s && s.present ? { id, heading, wrap: wrap || 'section', role: s.role, cite: s.cite, material: s.material } : null;
    })
    .filter(Boolean);

  return {
    title,
    dateLine,
    framingNote: `${CHATHAM_RULE_TEXT}  This record does not express opinions of its own; the views summarised are those of participants, synthesised under the Rule.`,
    meta,
    fixedCitations: [CHATHAM_RULE_CITATION],
    aggregate,
    genre,
    template: G.template,
    engine: G.engine,
    voice: G.voice,
    docKind: G.docKind,
    sections,
  };
}

export { DEFAULT_GENRE };

function formatDate(iso) {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}
