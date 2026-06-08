# Loom — live discussion loom · design

*2026-06-08. Built same-day for the HAI Lab / Institute for Ethics in AI roundtable
(executives, university leaders, Australian military officers). Facilitator takes
scribe notes; the room watches emergent organisation; afterwards a structured DB
becomes a whitepaper souvenir.*

## Goal

A local-hosted web interface where a single facilitator types terse notes and sees:
emergent theme organisation (Obsidian-style graph), bridging connections, applicable
heuristics when questions/painpoints arise, principled generalisation of anecdotes,
and live supporting fact-checks + technical boundary conditions — all manifested
visually and legibly for a watching room. Seed themes: **values** and **painpoints**.

## Decisions (from brainstorming)

- **Visual:** hybrid — force-directed graph centre + two side rails (heuristics left,
  fact-checks/boundary right).
- **Workers (all four):** theme clustering, bridging, heuristics matcher, fact-check +
  boundary + anecdote→principle.
- **Cadence:** auto, per committed note (sequential queue).
- **Runtime:** single local Node app, facilitator is sole typist.

## Architecture

```
browser (vanilla JS + D3, no build) ──HTTP POST /api/note──▶ Node http server
        ▲                                                      │ store (atomic json + jsonl)
        └────────────── WebSocket (state push) ────────────────┤ enrichment queue (sequential)
                                                                └─▶ workers → OpenAI (fetch)
```

- **Server** (`src/server.js`): Node `http` static serving + JSON API + `ws`. Note
  commit is synchronous (store + broadcast), enrichment is queued and async.
- **Store** (`src/store.js`): source of truth `data/session.json` (atomic write),
  append-only `data/events.jsonl`. Three pinned anchor themes: VALUES, PAINPOINTS,
  OPEN QUESTIONS.
- **Workers** (`src/workers.js`): triage (cheap) → fan-out (theme/bridge always;
  heuristic for question|painpoint; fact-check for claim|anecdote). Each is
  best-effort; failure never blocks note-taking.
- **LLM** (`src/llm.js`): native `fetch` to `api.openai.com` (no SDK). Fast =
  `gpt-5.4-mini` (`reasoning_effort: none`), strong = `gpt-5.4` (`low`). JSON mode,
  one retry, hard timeout, returns null on failure.
- **Heuristics** (`src/heuristics.js`): parses 50 vendored vault docs (frontmatter
  hooks, principle, "questions it forces"); LLM reranks the catalog (no embeddings).
- **Cost** (`src/cost.js`): per-call token + estimated-$ log to `data/costs.jsonl`.
- **Client** (`public/`): `graph.js` D3 force sim with position-preserving updates
  and animated bridges; `app.js` ws client + rails + scratchpad + pause.
- **Export** (`scripts/export.js`): `session.json` → whitepaper-scaffold markdown.

## Data model

`notes` (id, text, ts, kind, speaker, themeIds) · `themes` (anchor|emergent) ·
`bridges` (source, target, type, rationale) · `heuristicHits` · `factChecks`
(verdict ∈ verified|needs-nuance|contested|unknown) · `boundaryConditions` ·
`generalisations`.

## Guarantees

Note-taking is network-independent and crash-safe (atomic write + append log).
Fact-check never fabricates citations ("unknown" is encouraged). Pause AI stops all
outbound calls. Graph renders offline (D3 vendored locally).

## Verified (2026-06-08)

Self-test PASS; 4-note end-to-end produced correct triage, an emergent theme, 6
bridges (incl. a tension edge), 2 heuristic matches, an honest `unknown` fact-check
with boundary + principle; UI rendered in a real browser; cost logging confirmed
(~$0.001/note).

## Deferred (YAGNI for v1)

Multi-client sync, participant submissions, embeddings-based heuristic retrieval,
per-bridge-type styling beyond colour.
