# Loom — choicepoint decision log

Decisions made while building, with the reasoning, so they can be revisited.

| # | Choice | Decision | Why |
|---|---|---|---|
| 1 | API transport | Native `fetch`, **no OpenAI SDK** | Verified exact payloads work; removes SDK-version risk (e.g. silently-dropped `reasoning_effort`) and a dependency. |
| 2 | Models | fast `gpt-5.4-mini` (effort `none`, ~1s); strong `gpt-5.4` (effort `low`, ~3.7s) | Smoke-tested for latency + JSON behaviour against the actual key. `minimal` effort is unsupported on 5.4; `none` is fastest. |
| 3 | Dependencies | only `ws` | Sub-second `npm install`; can't fail on flaky venue wifi the morning of. |
| 4 | Storage | atomic `session.json` + append `events.jsonl` | Crash-safe for a high-stakes live session; trivially exportable; no DB to break. |
| 5 | Heuristic match | LLM rerank over a text catalog (no embeddings) | Dependency-free, offline-parseable, fast enough; 50 items ≈ 2.5k tokens/call. |
| 6 | Client rendering | vanilla + D3 vendored locally, no build step | Maximum robustness; graph renders without network; nothing to compile. |
| 7 | Worker cadence | sequential queue, per committed note | Bounds cost and ordering; human typing pace keeps it responsive. |
| 8 | Note path vs AI | commit + render are synchronous; enrichment async | Note-taking must never be held hostage by a slow API in front of the room. |
| 9 | Input model (revised) | **single text field**, no speaker capture | Chatham House rules — no provenance. Faster to type. |
| 10 | Note text (revised) | AI **cleans shorthand/typos** into a sensible note (in triage) | Facilitator types fast and rough; the displayed/exported note is the tidied version, raw kept in the log. |
| 11 | Colour (revised) | colour-code by **parent type** (values/painpoints/questions) | Parent identity is the primary visual language; bridges use one neutral accent to avoid clashing. |
| 12 | Accessibility (revised) | **protanopia-safe** blue/orange/violet, never red-vs-green; colour is redundant (position near labelled anchor) | Audience skews male; ~8% have red-green CVD. Don't rely on colour alone. |
| 13 | Panels (revised) | **one** side panel; fact-checks fold into the live feed with a highlight + verdict chip | Reciting heuristics/fact-checks in a rail is low-value; an activity feed shows momentum and frees the graph to be wider. |
| 14 | New-node feedback (revised) | transient white **glow** on new graph nodes (2.6s, reverts to base) | Draws the eye to what just arrived without permanent clutter; survives re-renders via a `glowing` set. |
| 15 | Edge inspection (revised) | bridges hoverable via a fat invisible hit-path → tooltip with type + rationale | The connection's *rationale* is the interesting part; thin edges need a wide hit area to grab. |
| 16 | Asset caching (revised) | `Cache-Control: no-store` on static files | Tool is iterated live; a reload must always serve fresh JS/CSS (fixes stale tabs). |
