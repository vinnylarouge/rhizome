# Loom — live discussion loom

Type terse scribe notes during a discussion; the room watches a knowledge graph
self-organise, with relevant **heuristics** and live **fact-checks / boundary
conditions** streaming into the margins. Afterwards, export a structured database
that becomes a whitepaper souvenir.

Built for the HAI Lab / Institute for Ethics in AI roundtable (executives,
university leaders, senior military officers). Seed themes: **values** and **painpoints**.

---

## Quick start

```bash
npm install        # one dependency (ws); ~1s
npm start          # → http://localhost:7777
```

Open `http://localhost:7777` in a browser (full-screen / projector).
Watch the terminal for `self-test (OpenAI reachability): PASS ✓`.

## Using it live

- **One input field. Type fast — typos and shorthand are fine.** Press ⏎ to commit
  (Shift+⏎ for a newline). The AI rewrites each rough note into one clean sentence.
- **No provenance is captured** — Chatham House rules. There is no speaker field.
- The note **appears on the graph instantly** — the AI never blocks your typing.
  Within ~1s it is tidied and colour-coded; seconds later bridges, fact-checks and
  feed entries arrive around it.
- **Colour = parent type** (protanopia-safe): **blue = values**, **orange =
  painpoints**, **violet = open questions**; cream = emergent theme. Legend
  bottom-left. Notes also sit near their labelled anchor, so colour is never the
  only cue.
- **One side panel = live feed** (newest on top) of everything the AI generates:
  refinements, new themes, bridges (with the connection **type** as a header),
  heuristics, and **fact-checks / boundary conditions** (highlighted, with the
  verdict as a chip). New graph nodes glow briefly as they arrive.
- **⏸ Pause AI** halts all outbound API calls instantly (you keep taking notes).
- **Edit the title** (top-left) by clicking it. Hover a node to read it; **hover an
  edge to see the connection's type and rationale**; drag to arrange; scroll to zoom.

### What the workers do (the live "subagents")

| worker | fires on | output |
|---|---|---|
| triage | every note | **cleans the shorthand** + kind (value/painpoint/question/claim/anecdote) + parent + theme |
| theme clustering | every note | emergent named theme nodes on the graph |
| bridging | every note | non-obvious typed links (tension / echoes / causes / instance-of) |
| heuristics | questions & painpoints | a relevant thinking heuristic (shown compactly in the feed) |
| fact-check + boundary | claims & anecdotes | verdict (never fabricates sources) + "true only when…" + distilled principle |

## After the session

```bash
npm run export     # → data/whitepaper-<timestamp>.md  (structured scaffold)
npm run cost       # per-worker token + estimated $ summary
```

Turning the scaffold into polished prose is a later, non-live step.

## Morning-of checklist

1. `npm start`, confirm **self-test PASS ✓** in the terminal.
2. Open `http://localhost:7777`; commit one throwaway note, watch a node appear
   and (within ~10s) a theme/bridge form. Then `npm run reset` to clear it.
3. Confirm the venue has internet (only the API calls need it; the graph renders
   offline). If wifi is shaky, you can still take notes — enrichment just pauses.
4. Keep the terminal visible to you (not the projector) — it shows worker errors.

## Reset between runs

```bash
npm run reset      # archives session.json/events.jsonl/costs.jsonl with a timestamp
npm start          # clean board (resumes automatically if you don't reset)
```

Nothing is ever deleted — reset renames with a timestamp.

## Configuration (`.env`)

```
OPENAI_API_KEY=…              # real OpenAI platform key (from the blueprint project)
LOOM_FAST_MODEL=gpt-5.4-mini  # triage / theme / bridge / heuristic   (reasoning_effort none)
LOOM_STRONG_MODEL=gpt-5.4     # fact-check / boundary / generalisation (reasoning_effort low)
PORT=7777
```

## Resilience notes

- **Note-taking never depends on the network.** Notes commit and render before any
  API call; enrichment is queued and additive.
- **Crash-safe.** `data/session.json` is atomically written on every change and
  `data/events.jsonl` is an append-only backup. Reload the page or restart the
  server and the session is intact.
- **Privacy.** All state stays local. The only thing that leaves the machine is the
  note text sent to OpenAI for enrichment — pause AI to stop even that.

## Layout

```
src/      server.js · store.js · workers.js · heuristics.js · llm.js · cost.js
public/   index.html · style.css · graph.js (D3) · app.js · vendor/d3.v7.min.js
scripts/  export.js · cost.js · reset.js
heuristics/  50 heuristic docs (vendored from the heuristics project)
data/     session.json · events.jsonl · costs.jsonl   (gitignored)
```
