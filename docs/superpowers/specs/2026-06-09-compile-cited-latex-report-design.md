# Design: `/compile` — discussion-board → cited LaTeX roundtable report

*Brainstormed 2026-06-09. Status: approved (design forks confirmed via Q&A).*

## Goal

Turn a finished Loom session (`data/session.json`) into a polished, **Chatham
House-style roundtable report** as a compiled LaTeX PDF, triggered live from the
web UI by a new `/compile` command. The report carries **real, verified external
citations** ("receipts" — clickable URLs) on its empirical claims and on the
provenance of the thinking-heuristics it invoked, with structural
anti-hallucination guarantees. Final prose is modulated to avoid "AI-writing
tells".

This supersedes nothing: `npm run export` remains the quick Markdown scaffold;
`/compile` is the rich, cited, typeset souvenir.

## Locked decisions

| Fork | Decision |
|---|---|
| Run model | In-app `/compile` command; Node server; existing `.env` OpenAI key; model **GPT-5.5** (`LOOM_PAPER_MODEL=gpt-5.5`). Live workers stay on `gpt-5.4`. |
| Genre | Chatham House-style roundtable report (single-column, policy-facing, non-attribution). |
| Citation scope | **Conservative** — only empirical `factChecks` and heuristic provenance carry external citations. Anonymized opinions stay uncited. |
| Verify rigor | **Strict single-verifier** — a citation exists only if a fetched page yields a quoted passage that supports the claim; else the claim is flagged `[unsupported]`. Never fabricate. |
| Style | Both: anti-AI-tell style guide injected into every generation prompt **and** a final smell-check rewrite pass over the assembled draft. |
| Export | Keep both `export.js` (Markdown) and `/compile` (LaTeX). |
| Corpus depth | Focused (~6–10 paradigmatic sources) parallel research sweep. |

## The two-time split (key architectural idea)

Grammar and style are **research-derived once and baked into the repo as
committed reference artifacts**; runtime `/compile` only *fills* them. Re-deriving
the grammar each run would be slow, non-deterministic, and costly; baking it makes
runs reproducible and the grammar a hand-editable control surface (mirrors how
Loom vendors its 50 heuristic docs as static files).

```
DESIGN TIME (Claude Code agents, web-capable, one-off)
  • gather paradigmatic AI-ethics/policy roundtable reports
  • extract generative grammar  -> docs/paper-grammar.md
  • research AI-writing "tells"  -> docs/style-guide.md
        | (baked in)
        v
RUN TIME (in-app /compile; Node + OpenAI GPT-5.5; .env key)
  state -> Linearize -> Citation agency -> Prose -> LaTeX -> PDF
          (grammar)    (web_search+verify)  (style)  (.tex/.bib)
```

## The generative grammar (proposed skeleton; validated against corpus)

Ordered section spec for a roundtable report, each fed by specific
`session.json` elements. The grammar file encodes per-section: ordering,
include/suppress rules, target length, voice, and **which sections carry
citations**.

| § | Section | Fed by | Citations? |
|---|---|---|---|
| 1 | Title + Chatham House framing note | `session.title`, disclaimer | no |
| 2 | Executive summary | top themes + key tensions + recommendations (synthesized last) | no |
| 3 | Introduction / about this convening | anchors, participant archetypes | no |
| 4 | Findings by theme | emergent `themes` (by salience) → `notes`, `generalisations` | no |
| 5 | Tensions & trade-offs | `bridges` of type `tension` | no |
| 6 | Conceptual frames | `frames` (metaphors/frames) | no |
| 7 | Evidence & caveats | `factChecks` + `boundaryConditions` | **yes** |
| 8 | Recommendations | synthesized from values × painpoints | no |
| 9 | Open questions | `kind==='question'` + abducted questions | no |
| A | Heuristics appendix | `heuristicHits` | **yes** (provenance) |
| R | References | citation agency output | — |

Theme salience = note count + bridge degree. The linearizer resolves all
bridge/heuristic note references to their tidied text (`clean || text`).

## Components

### `src/paper/plan.js` — linearizer (deterministic, no network)
Pure function `state -> paperPlan` (JSON). Walks the grammar, selects/orders/
dedupes graph elements into section "slots," resolves references, ranks themes.
Same state in → same plan out. Unit-testable on the sample session.

### `src/paper/cite.js` — citation research-agency (conservative + strict)
Runs only on §7 empirical `factChecks` and the heuristics appendix. Per item:
1. **Search** — OpenAI Responses API + `web_search` tool (GPT-5.5) → candidate URLs.
2. **Verify (strict single-verifier)** — fetch candidate; a verifier call must
   quote the supporting passage. Supported → `.bib` entry + `\cite` + receipt
   URL. Unsupported → drop, flag claim `[unsupported]`.
3. **Receipts** — every citation stores its resolved URL (clickable via
   `hyperref`).

`fact-check` verdicts of `unknown` get no citation by default. The verifier's
quote *is* the receipt — a citation cannot exist without a fetched supporting
passage (structural anti-hallucination).

### `src/paper/style.js` + `docs/style-guide.md` — style modulation
Style guide = negative constraints (avoid specific AI tells) + positive voice
targets, injected into every prose prompt. Final smell-check pass: one GPT-5.5
call scores the assembled draft against the tell-list and rewrites flagged
sentences.

### `src/paper/latex.js` + `templates/report.tex.js` — assembly & compile
Single-column report template; `biblatex` + `biber`; `hyperref` (clickable
receipts); `microtype`. Plan + prose + `.bib` → `data/paper-<ts>.{tex,bib}`,
compiled with `latexmk` → `data/paper-<ts>.pdf`. (Toolchain confirmed present:
pdflatex/xelatex/lualatex/latexmk/biber.)

### `src/llm.js` additions
New `responsesCall(...)` helper for the Responses API + `web_search` tool,
alongside existing `chatJSON`. `web_search` availability smoke-tested at boot
(like `selfTest`); if unavailable, agency emits zero citations and flags
everything `[unsupported]` (never guesses).

### `/compile` integration
- Server: `POST /api/compile` → `enqueue` a `compilePass`; stream progress via
  `broadcastStatus` ("Linearizing…", "Finding receipts (3/8)…", "Writing
  §Findings…", "Compiling PDF…"); final feed item with download link. Shares the
  sequential queue, so it never races note enrichment.
- Client: add `/compile` to the slash-command list in `public/app.js`.
- A GET route (`/api/paper?file=…`, sandboxed to `data/`) serves the result for
  in-browser download.

## Data flow

```
session.json
  -> plan.js          (paperPlan: ordered sections + slotted elements)
  -> cite.js          (paperPlan + citations[] + bibtex + [unsupported] flags)
  -> prose (GPT-5.5)  (section prose, style guide injected)
  -> style.js         (smell-check rewrite)
  -> latex.js         (paper-<ts>.tex + .bib)
  -> latexmk          (paper-<ts>.pdf)
```

## Build sequence

1. **Research** (parallel agents, design-time): corpus → `docs/paper-grammar.md`;
   AI-tells → `docs/style-guide.md`.
2. **Linearizer** + plan schema + sample-data test.
3. **LaTeX assembly** + template; prove a stub plan compiles to PDF.
4. **Citation agency** (smoke-test `web_search` first).
5. **Style layer** + prose generation.
6. **Wire `/compile`** end-to-end; run on existing session; confirm real PDF with
   clickable receipts.

## Testing / verification

- `plan.js`: deterministic unit test on `data/session.json` sample.
- LaTeX: stub-plan compile must produce a valid PDF before wiring real prose.
- `web_search`: boot smoke-test against the real key; explicit fallback path.
- End-to-end: `/compile` on the sample session yields a PDF whose references are
  fetchable URLs that actually support their claims (spot-check).

## Risks & mitigations

- **`web_search` may be unavailable on the key/model.** → smoke-test + strict
  no-citation fallback; never fabricate.
- **GPT-5.5 / Responses API payload shape uncertain.** → verify exact shape via a
  one-off smoke test before wiring (precedent: choicepoint #2).
- **Long-running compile blocks the queue.** → it's enqueued like other passes;
  acceptable post-session; status streamed so the room sees progress.
- **Sparse sessions** (few claims) → most sections degrade gracefully to "no
  material"; report still compiles.

## Out of scope (for now)

- Multi-genre parametric templates (academic/policy-brief) — roundtable only.
- Citing anonymized opinions — conservative scope excludes them.
- Real-time (during-session) compilation — post-session only.
