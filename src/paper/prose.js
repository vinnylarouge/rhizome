// prose.js — turn a (cited) paperPlan into TeX-ready section prose, in the voice of
// the chosen genre (plan.voice) plus the universal STYLE_CONSTRAINTS. Summary-type
// sections (exec summary, abstract, key findings, conclusion) are written last so
// they can lean on the generated recommendations. A single smell-check pass then
// fixes residual AI tells without flattening. Cite-bearing items get \autocite at
// render time; the model never touches citation keys.

import { chatJSON, MODELS } from '../llm.js';
import { escapeTeX } from './latex.js';
import { STYLE_CONSTRAINTS, smellCheck } from './style.js';

const M = MODELS.PAPER;

async function gen(sys, userObj, label, voice, maxTokens = 1600) {
  const out = await chatJSON({
    model: M,
    system: `${sys}\n\n${voice}\n\n${STYLE_CONSTRAINTS}`,
    user: typeof userObj === 'string' ? userObj : JSON.stringify(userObj),
    label: 'prose:' + label,
    maxTokens,
    timeoutMs: 90000,
  });
  return out || {};
}

const arr = (x) => (Array.isArray(x) ? x.filter((s) => typeof s === 'string' && s.trim()) : []);

async function genById(id, m, ctx, voice) {
  switch (id) {
    case 'abstract': {
      const o = await gen(
        'Write the Abstract for an academic paper: a single paragraph of roughly 150-220 words stating the problem, what the convening examined and how, the main findings, and the contribution. Measured and scholarly, third person.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { title: m.title, topThemes: m.topThemes, tensions: m.tensions, principles: m.principles, recommendations: ctx.recommendations, openQuestions: m.openQuestions },
        'abstract', voice, 900
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'key-findings': {
      const o = await gen(
        'Write the "Key Findings" box for a policy brief: 3 to 6 short, punchy, standalone findings a busy decision-maker can scan in seconds. Each is one sentence, concrete, and states a FINDING (not a recommendation). Draw on the themes, principles, tensions, and painpoints.\nReturn ONLY JSON {"items":[...]}.',
        { themes: m.topThemes, principles: m.principles, tensions: m.tensions, painpoints: m.painpoints },
        'key-findings', voice, 700
      );
      const items = arr(o.items);
      return { type: 'list', ordered: false, items: items.length ? items : (m.principles || []).slice(0, 4) };
    }
    case 'about': {
      const o = await gen(
        'Write the section that explains how this record was produced. State who took part (the participants), the method (a live, structured discussion captured as scribe notes that were organised into themes with light AI assistance), the date, that it was held under the Chatham House Rule, and the synthesis caveat in your own words. A short paragraph or two.\nReturn ONLY JSON {"paragraphs":["..."]}.',
        { participants: m.participants, noteCount: m.noteCount, themeCount: m.themeCount, date: m.dateLine, synthesisDisclaimer: m.synthesisDisclaimer },
        'about', voice, 900
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs).length ? arr(o.paragraphs) : [`This record summarises a discussion among ${m.participants}, held on ${m.dateLine} under the Chatham House Rule. ${m.synthesisDisclaimer}`] };
    }
    case 'intro': {
      const o = await gen(
        `Write the opening section for "${m.title}". In two or three full paragraphs, set the scene and the stakes for the people in the room, draw on the values and painpoints they raised, and name the central tension plainly. The last sentence says what the document sets out to do.\nReturn ONLY JSON {"paragraphs":[...]}.`,
        { values: m.values, painpoints: m.painpoints, centralTension: m.centralTension },
        'intro', voice
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'findings': {
      const o = await gen(
        'Write the main body. For EACH theme, write a titled subsection of a developed paragraph or two that tells the story of what participants raised, using concrete, anonymised points and weaving in any stated principle. Flowing prose, not bullets.\nReturn ONLY JSON {"subsections":[{"heading":"a specific issue in Title Case","paragraphs":["..."]}]} with one entry per input theme, in the same order.',
        { themes: m.themes.map((t) => ({ theme: t.label, summary: t.summary, points: t.notes.map((n) => n.text), principles: t.principles })) },
        'findings', voice, 2600
      );
      let subs = Array.isArray(o.subsections) ? o.subsections.filter((s) => s && (s.heading || (s.paragraphs && s.paragraphs.length))) : [];
      subs = subs.map((s, i) => ({ heading: s.heading || m.themes[i]?.label || 'Finding', paragraphs: arr(s.paragraphs) }));
      if (!subs.length) subs = m.themes.map((t) => ({ heading: t.label, paragraphs: [t.notes.map((n) => n.text).join(' ')] }));
      return { type: 'subsections', subs };
    }
    case 'tensions': {
      const o = await gen(
        'Write the section on the tensions and trade-offs. Each tension pairs two positions from the discussion: in a full paragraph, lay out what pulls each way, why the disagreement is real, and where the room leaned if it did. Flowing prose, not bullets.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { tensions: m.tensions, relatedLinks: m.otherLinks },
        'tensions', voice, 2000
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'frames': {
      const o = await gen(
        'Write the section on the conceptual frames and metaphors in play. For each, a short paragraph on how it shows up in the discussion and what it illuminates, naming the themes it spans.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { frames: m.frames },
        'frames', voice, 1400
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'evidence': {
      const o = await gen(
        'Write the section on evidence and caveats. For EACH item write a paragraph: state the claim, give the honest verdict in plain words, and explain the boundary condition (when it holds versus breaks). Do not invent sources, numbers, or certainty.\nReturn ONLY JSON {"items":["paragraph 1", ...]} with one string per input item, in the same order.',
        { items: m.items.map((e) => ({ claim: e.statement, verdict: e.verdict, detail: e.detail, boundary: e.boundary })) },
        'evidence', voice, 2000
      );
      const texts = arr(o.items);
      return {
        type: 'evidence',
        items: m.items.map((e, i) => ({ text: texts[i] || `${e.statement} ${e.detail}`.trim(), citationKey: e.citationKey || null, unsupported: !!e.unsupported, privateClaim: !!e.privateClaim })),
      };
    }
    case 'considerations': {
      const o = await gen(
        'Write the section presenting the principles distilled from the discussion as considerations: advisory, one step short of formal recommendations. A couple of full paragraphs that connect the principles to what was heard.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { principles: m.principles.map((p) => p.principle) },
        'considerations', voice, 1400
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'recommendations': {
      const o = await gen(
        'Write the recommendations: 4-7 concrete, operational recommendations, each addressed to a named actor (for example "Acquisition leads should...", "Programme owners should...", "Vendors should..."), each one or two sentences, action-verb-led and specific. Ground them in the values, painpoints, principles, and tensions.\nReturn ONLY JSON {"items":["rec 1", ...]}.',
        { values: m.values, painpoints: m.painpoints, principles: m.principles, tensions: m.tensions },
        'recommendations', voice, 1800
      );
      const items = arr(o.items);
      return { type: 'list', ordered: true, items: items.length ? items : ['Pair every fielded system with a named human owner accountable for its decisions.'] };
    }
    case 'open-questions': {
      const o = await gen(
        'Write the open-questions section: render each as a clear question the group did not resolve. You may lightly rephrase for clarity but keep each a genuine question.\nReturn ONLY JSON {"items":[...]}.',
        { questions: m.items.map((q) => q.text) },
        'open-questions', voice, 900
      );
      const items = arr(o.items);
      return { type: 'list', ordered: false, items: items.length ? items : m.items.map((q) => q.text) };
    }
    case 'conclusion': {
      const o = await gen(
        'Write a strong closing of a paragraph or two: state the stakes and the single most important next step, with enough texture to land. Add something; do not merely restate earlier points.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { title: m.title, recommendations: ctx.recommendations },
        'conclusion', voice, 900
      );
      return { type: 'prose', paragraphs: arr(o.paragraphs) };
    }
    case 'exec-summary': {
      const o = await gen(
        'Write the summary so it stands alone for a reader who reads nothing else: the problem, the core findings, and the headline recommendations, in two or three full paragraphs. Confident and concrete.\nReturn ONLY JSON {"paragraphs":[...]}.',
        { title: m.title, topThemes: m.topThemes, tensions: m.tensions, principles: m.principles, recommendations: ctx.recommendations, openQuestions: m.openQuestions },
        'exec-summary', voice, 1600
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
  const voice = plan.voice || '';
  const ctx = { recommendations: [] };
  const renders = {};

  // recommendations before the summary-type sections that reference them
  const order = ['about', 'intro', 'findings', 'tensions', 'frames', 'evidence', 'considerations', 'recommendations', 'open-questions', 'key-findings', 'conclusion', 'abstract', 'exec-summary'];
  for (const id of order) {
    if (!byId[id]) continue;
    onProgress(`Writing §${byId[id].heading}…`);
    renders[id] = await genById(id, byId[id].material, ctx, voice);
    if (id === 'recommendations') ctx.recommendations = renders[id].items || [];
  }
  if (byId['heuristics']) renders['heuristics'] = { type: 'heuristics', items: byId['heuristics'].material.items };

  const flat = [];
  const setters = [];
  collectStrings(renders, flat, setters);
  onProgress('Smell-check: removing residual AI tells…');
  const cleaned = await smellCheck(flat, M);
  cleaned.forEach((s, i) => setters[i](s));

  const sections = present
    .map((s) => ({ heading: s.heading, wrap: s.wrap || 'section', body: renderSection(renders[s.id]) }))
    .filter((s) => s.body && s.body.trim());

  return {
    title: plan.title,
    dateLine: plan.dateLine,
    framingNote: plan.framingNote,
    docKind: plan.docKind,
    template: plan.template,
    engine: plan.engine,
    sections,
    references: plan.references || plan.fixedCitations || [],
  };
}
