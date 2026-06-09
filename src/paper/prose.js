// prose.js — turn a (cited) paperPlan into TeX-ready section prose. Each section is
// generated in the voice prescribed by the grammar, with STYLE_CONSTRAINTS injected.
// The executive summary and conclusion are written last (they lean on the generated
// recommendations). A single smell-check pass then rewrites any residual AI tells.
// Cite-bearing items (evidence, heuristics) get \autocite markers at render time;
// the model never touches citation keys.

import { chatJSON, MODELS } from '../llm.js';
import { escapeTeX } from './latex.js';
import { STYLE_CONSTRAINTS, smellCheck } from './style.js';

const M = MODELS.PAPER;

async function gen(sys, userObj, label, maxTokens = 1400) {
  const out = await chatJSON({
    model: M,
    system: sys + '\n\n' + STYLE_CONSTRAINTS,
    user: typeof userObj === 'string' ? userObj : JSON.stringify(userObj),
    label: 'prose:' + label,
    maxTokens,
    timeoutMs: 90000,
  });
  return out || {};
}

const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.trim()) : []);

// ---- per-section generators -> normalized render structures --------------------
async function genById(id, m, ctx) {
  switch (id) {
    case 'about': {
      const o = await gen(
        'Write the "About This Convening" section of a Chatham House-style roundtable report. State who took part (the participants), the method (a live, structured discussion captured as scribe notes that were organised into themes with light AI assistance), the date, that it was held under the Chatham House Rule, and the synthesis caveat in your own words. 1-2 short paragraphs.\nReturn ONLY JSON {"paragraphs":["..."]}.',
        { participants: m.participants, noteCount: m.noteCount, themeCount: m.themeCount, date: m.dateLine, synthesisDisclaimer: m.synthesisDisclaimer },
        'about'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs).length ? arr(o.paragraphs) : [`This record summarises a discussion among ${m.participants}, held on ${m.dateLine} under the Chatham House Rule. ${m.synthesisDisclaimer}`] };
    }
    case 'intro': {
      const o = await gen(
        `Write the Introduction to a roundtable report titled "${m.title}". Frame the problem and why it matters now for the people in the room, drawing on the values and painpoints they raised. Name the central tension plainly. 2-3 short paragraphs; the last sentence states what the report sets out to do.\nReturn ONLY JSON {"paragraphs":[...]}.`,
        { values: m.values, painpoints: m.painpoints, centralTension: m.centralTension },
        'intro'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'findings': {
      const o = await gen(
        'Write the Findings section of a roundtable report. For EACH theme, write a short titled subsection (2-4 sentences) summarising what participants raised, using concrete, anonymised points and any stated principle. Write prose, not bullets.\nReturn ONLY JSON {"subsections":[{"heading":"a specific issue in Title Case","paragraphs":["..."]}]} with one entry per input theme, in the same order.',
        { themes: m.themes.map((t) => ({ theme: t.label, summary: t.summary, points: t.notes.map((n) => n.text), principles: t.principles })) },
        'findings',
        2200
      );
      let subs = Array.isArray(o.subsections) ? o.subsections.filter((s) => s && (s.heading || (s.paragraphs && s.paragraphs.length))) : [];
      subs = subs.map((s, i) => ({ heading: s.heading || m.themes[i]?.label || 'Finding', paragraphs: arr(s.paragraphs) }));
      // fallback: if the model under-delivered, template from points
      if (!subs.length) subs = m.themes.map((t) => ({ heading: t.label, paragraphs: [t.notes.map((n) => n.text).join(' ')] }));
      return { type: 'subsections', subs };
    }
    case 'tensions': {
      const o = await gen(
        'Write the "Tensions and Trade-offs" section. Each tension pairs two positions from the discussion: state it in a sentence or two, name where the pull comes from, and where the room leaned if it did. Prose, not bullets.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { tensions: m.tensions, relatedLinks: m.otherLinks },
        'tensions'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'frames': {
      const o = await gen(
        'Write the "Conceptual Frames" section. For each frame or metaphor, explain in 1-2 sentences how it shows up in the discussion and which themes it spans. Prose.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { frames: m.frames },
        'frames'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'evidence': {
      const o = await gen(
        'Write the "Evidence and Caveats" section. For EACH item write ONE short paragraph: state the claim, give the honest verdict in plain words, and state the boundary condition (when it holds versus breaks). Do not invent sources, numbers, or certainty.\nReturn ONLY JSON {"items":["paragraph 1", ...]} with one string per input item, in the same order.',
        { items: m.items.map((e) => ({ claim: e.statement, verdict: e.verdict, detail: e.detail, boundary: e.boundary })) },
        'evidence',
        1800
      );
      const texts = arr(o.items);
      return {
        type: 'evidence',
        items: m.items.map((e, i) => ({
          text: texts[i] || `${e.statement} ${e.detail}`.trim(),
          citationKey: e.citationKey || null,
          unsupported: !!e.unsupported,
          privateClaim: !!e.privateClaim,
        })),
      };
    }
    case 'considerations': {
      const o = await gen(
        'Write the "Considerations and Emerging Principles" section. Present these distilled principles as advisory considerations (soft, one step short of formal recommendations). Prose, 1-2 short paragraphs.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { principles: m.principles.map((p) => p.principle) },
        'considerations'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'recommendations': {
      const o = await gen(
        'Write the Recommendations: 4-7 concrete, operational recommendations, each addressed to a named actor (for example "Acquisition leads should...", "Programme owners should...", "Vendors should..."), each one or two sentences, action-verb-led. Ground them in the values, painpoints, principles, and tensions provided.\nReturn ONLY JSON {"items":["rec 1", ...]}.',
        { values: m.values, painpoints: m.painpoints, principles: m.principles, tensions: m.tensions },
        'recommendations',
        1800
      );
      const items = arr(o.items);
      return { type: 'list', ordered: true, items: items.length ? items : ['Pair every fielded system with a named human owner accountable for its decisions.'] };
    }
    case 'open-questions': {
      const o = await gen(
        'Write the "Open Questions" section: render each as a clear question the group did not resolve. You may lightly rephrase for clarity but keep each a genuine question.\nReturn ONLY JSON {"items":[...]}.',
        { questions: m.items.map((q) => q.text) },
        'open-questions'
      );
      const items = arr(o.items);
      return { type: 'list', ordered: false, items: items.length ? items : m.items.map((q) => q.text) };
    }
    case 'conclusion': {
      const o = await gen(
        'Write a short Conclusion (one paragraph) stating the stakes and the single most important next step. Add something; do not restate earlier points.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { title: m.title, recommendations: ctx.recommendations },
        'conclusion'
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'exec-summary': {
      const o = await gen(
        'Write the Executive Summary so it stands alone for a reader who reads nothing else. State the problem, the core finding, and the headline recommendations. Present tense, declarative, minimal hedging. 2-3 short paragraphs.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { title: m.title, topThemes: m.topThemes, tensions: m.tensions, principles: m.principles, recommendations: ctx.recommendations, openQuestions: m.openQuestions },
        'exec-summary',
        1600
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    default:
      return { type: 'prose', paragraphs: [] };
  }
}

// ---- smell-check plumbing: flatten plain-prose strings with write-back setters ---
function collectStrings(renders, flat, setters) {
  for (const id of Object.keys(renders)) {
    const r = renders[id];
    if (!r) continue;
    if (r.type === 'prose') r.paragraphs.forEach((p, i) => { flat.push(p); setters.push((v) => { r.paragraphs[i] = v; }); });
    else if (r.type === 'list') r.items.forEach((p, i) => { flat.push(p); setters.push((v) => { r.items[i] = v; }); });
    else if (r.type === 'subsections') r.subs.forEach((su) => su.paragraphs.forEach((p, i) => { flat.push(p); setters.push((v) => { su.paragraphs[i] = v; }); }));
    else if (r.type === 'evidence') r.items.forEach((it) => { flat.push(it.text); setters.push((v) => { it.text = v; }); });
    // heuristics appendix is factual provenance — left out of the rewrite pass
  }
}

// ---- render normalized structures to TeX ----------------------------------------
function citeMarker(it) {
  if (it.citationKey) return ` \\autocite{${it.citationKey}}`;
  if (it.privateClaim) return ' \\textit{(the discussion’s own account; not independently verified)}';
  return ' \\textit{[unsupported]}';
}

function renderSection(r) {
  if (!r) return '';
  if (r.type === 'prose') return r.paragraphs.map(escapeTeX).join('\n\n');
  if (r.type === 'list') {
    const env = r.ordered ? 'enumerate' : 'itemize';
    return `\\begin{${env}}\n` + r.items.map((i) => `\\item ${escapeTeX(i)}`).join('\n') + `\n\\end{${env}}`;
  }
  if (r.type === 'subsections') {
    return r.subs.map((su) => `\\subsection{${escapeTeX(su.heading)}}\n${su.paragraphs.map(escapeTeX).join('\n\n')}`).join('\n\n');
  }
  if (r.type === 'evidence') {
    return r.items.map((it) => escapeTeX(it.text) + citeMarker(it)).join('\n\n');
  }
  if (r.type === 'heuristics') {
    return r.items
      .map((h) => `\\textbf{${escapeTeX(h.name)}.} ${escapeTeX(h.principle)}${h.citationKey ? ` \\autocite{${h.citationKey}}` : ''} \\textit{${escapeTeX(h.why)}}`)
      .join('\n\n');
  }
  return '';
}

// Compose a finished paper from a cited plan. Returns the object latex.compile() wants.
export async function composePaper(plan, { onProgress = () => {} } = {}) {
  const present = plan.sections;
  const byId = Object.fromEntries(present.map((s) => [s.id, s]));
  const ctx = { recommendations: [] };
  const renders = {};

  // generate non-summary sections first so the summary/conclusion can use recs
  const order = ['about', 'intro', 'findings', 'tensions', 'frames', 'evidence', 'considerations', 'recommendations', 'open-questions', 'conclusion', 'exec-summary'];
  for (const id of order) {
    if (!byId[id]) continue;
    onProgress(`Writing §${byId[id].heading}…`);
    renders[id] = await genById(id, byId[id].material, ctx);
    if (id === 'recommendations') ctx.recommendations = renders[id].items || [];
  }
  if (byId['heuristics']) renders['heuristics'] = { type: 'heuristics', items: byId['heuristics'].material.items };

  // final smell-check pass over the plain prose
  const flat = [];
  const setters = [];
  collectStrings(renders, flat, setters);
  onProgress('Smell-check: removing residual AI tells…');
  const cleaned = await smellCheck(flat, M);
  cleaned.forEach((s, i) => setters[i](s));

  // render in canonical plan order
  const sections = present
    .map((s) => ({ heading: s.heading, body: renderSection(renders[s.id]) }))
    .filter((s) => s.body && s.body.trim());

  return {
    title: plan.title,
    dateLine: plan.dateLine,
    framingNote: plan.framingNote,
    sections,
    references: plan.references || plan.fixedCitations || [],
  };
}
