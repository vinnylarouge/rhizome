# Rhizome — loom as an extensible Electron app

**Date:** 2026-06-11
**Status:** approved (design discussed and confirmed in session)

## Summary

Loom becomes **Rhizome**: a packaged macOS Electron app. The existing Node
server and vanilla-JS frontend survive intact — Electron wraps them rather than
replacing them — and three axes of configurability are added:

1. **Providers** — tokens served by an OpenAI API key *or* any local
   OpenAI-compatible server (Ollama, LM Studio, llama.cpp server, vLLM),
   chosen per model tier in a settings UI.
2. **Cores** — the discussion-specific knowledge (seed anchors, note kinds,
   worker prompts) extracted from code into editable data bundles, so
   different discussion types get different cores without code changes.
3. **Extensions** — a small registry that built-in features (ObsidianMD
   export, AI search over past sessions) ship through, proving the API that
   later third-party extensions will use.

## Decisions made

- **Local models via OpenAI-compatible endpoints.** Rhizome bundles no model
  runtime; it talks to whatever server the user runs. Provider = `{label,
  baseUrl, apiKey?, flags}`.
- **Updatable = data + git.** Cores/extensions/settings are data in the user
  folder (no rebuild to change). The app itself updates from this git repo
  (`npm run update`: pull → install → dist → swap `/Applications/Rhizome.app`
  → relaunch), surfaced as an in-app menu item. No electron-updater, no
  code-signing dependency.
- **v1 scope: everything.** Settings/providers/cores/sessions *and* Obsidian
  export *and* AI search ship now.
- **Packaged macOS app** via electron-builder (DMG, unsigned; first launch is
  right-click → Open).
- **Embedded server architecture** (approach A): Electron main spawns
  `src/server.js` as a `utilityProcess`; the window loads
  `http://127.0.0.1:<port>`. Preserves LAN/projector access — a plain browser
  on the network can still show the board, which is how loom is used live.

## Invariants to preserve

- **Note-taking never awaits the LLM.** Notes commit and render before any
  API call; enrichment is queued and additive.
- **Crash-safe state.** `session.json` atomically written; `events.jsonl`
  append-only. Server restarts (e.g. on settings change) are free.
- **Nothing is ever deleted.** Sessions are archived, never destroyed.
- **No fabricated citations.** `/compile` without web-search capability
  (i.e. on local providers) degrades to no-citation mode, never invents.

## Architecture

### Processes

```
Electron main (electron/main.js)
 ├─ utilityProcess: src/server.js   (env: RHIZOME_HOME, PORT)
 │    └─ http + ws on 127.0.0.1:<free port>, also reachable on LAN
 ├─ BrowserWindow → http://127.0.0.1:<port>
 └─ IPC (preload): pickFolder, updateFromGit, relaunch
```

The server keeps working headless (`npm start`) for dev and for
run-from-terminal use; Electron is additive.

### User data layout (`RHIZOME_HOME`, default `~/Library/Application Support/Rhizome`)

```
settings.json            providers, tier→provider/model map, vault path, extension settings
cores/<name>/core.json   user-editable copies; seeded from repo cores/ on first run
sessions/<id>/           session.json · events.jsonl · costs.jsonl · papers/
search-index.jsonl       {sessionId, nodeId, text, vector} per indexed node
extensions/              (scanned for user extensions; empty in v1)
```

Headless dev mode defaults `RHIZOME_HOME` to `./data/` so the repo remains
self-contained and `.env` keeps working as an override.

### Providers (`src/settings.js` + `src/llm.js`)

- `settings.json` holds `providers: []` with presets offered in the UI:
  OpenAI (`https://api.openai.com/v1`), Ollama (`http://localhost:11434/v1`),
  LM Studio (`http://localhost:1234/v1`), custom.
- Capability flags per provider: `reasoningEffort`, `webSearch`, `jsonMode`
  (OpenAI-only payload fields are omitted when flags are off).
- `tiers: { fast, strong, paper, embeddings }`, each `{providerId, model,
  effort?}` — tiers can mix providers (e.g. local fast workers, OpenAI paper).
- `llm.js` resolves tier → endpoint/auth/payload shape; adds `embed(texts)`;
  self-test per tier backs the settings UI "Test connection" button.
- `/compile` citation step requires the paper tier's provider to pass
  `webSearchSelfTest()`; otherwise existing no-citation fallback applies.

### Cores (`cores/` in repo → seeded to user dir; `src/cores.js`)

A core is one JSON file (prompts inline as strings):

```
{ id, name, description,
  anchors: [{id, label, color}],          // replaces hardcoded store.js anchors
  kinds:   [...],                          // note taxonomy used by triage
  prompts: { triage, theme, bridge, heuristic, factcheck, abduct, ... },
  abduction: { targets },                  // what /abduct surfaces
  compile: { defaultGenre } }
```

- `cores/roundtable/` reproduces today's behaviour *exactly* (values/
  painpoints anchors, current prompt text moved verbatim).
- Starter cores: `retrospective` (went-well/went-poorly), `design-crit`
  (goals/objections).
- `store.js`, `workers.js`, `src/paper/*` take the active core as input
  instead of constants. Each session records `coreId`; resuming a session
  reloads its core.

### Sessions (`src/store.js`, server API, library UI)

- Store gains lifecycle: `createSession({title, coreId})`, `openSession(id)`,
  `listSessions()`, `archiveSession(id)`. Active-session state otherwise
  unchanged.
- Server: `GET/POST /api/sessions`, `POST /api/sessions/:id/open`.
- Frontend: a library overlay (vanilla JS, same style) listing sessions
  (title, core, date, note count) with new/resume/archive; new-session modal
  picks a core. Shown at startup when no session is active.

### Extensions (`src/extensions/`)

```
{ id, name,
  commands?:        { '/obsidian': handler, ... },   // join /compile et al.
  onSessionEvent?:  (event, session) => {},          // e.g. note-enriched
  settingsSchema?:  [{key, label, type}] }           // surfaced in settings UI
```

Registry loads built-ins from `src/extensions/`, then scans
`RHIZOME_HOME/extensions/` (user extensions; v1 ships none). Server routes
unknown slash commands through the registry.

**Obsidian export** (`/obsidian`, menu item): writes
`«vault»/Rhizome/<session-title>/` — index note (frontmatter metadata), one
note per theme with its notes and `[[wikilinks]]` along bridges, compiled PDF
if present. Overwrites only its own folder. Vault path set in settings via
native folder picker (manual path entry in plain-browser mode).

**AI search** (`/search`, menu item): incremental embeddings index appended as
notes are enriched plus a backfill pass for older sessions; query → embed →
cosine top-k in memory (scale is thousands of nodes; no vector DB). Without an
embeddings tier configured, falls back to substring search, labelled as such.

### Electron shell

- Native menu: New Session · Session Library · Settings · Export to Obsidian ·
  Search · Update from Git.
- Settings is a page in the web UI (works over LAN too); only the folder
  picker requires the Electron bridge.
- Settings changes write `settings.json` and restart the server
  utilityProcess (crash-safe by design).

### Packaging & update

- electron-builder → unsigned DMG; `files` whitelist keeps `data/`,
  `node_modules` dev-only deps out.
- `scripts/update.sh`: `git pull && npm install && npm run dist && rsync` new
  `.app` over `/Applications/Rhizome.app`; menu item runs it and relaunches.

## Error handling

- Provider failures stay non-fatal (existing contract: `chatJSON` returns
  null, never throws into note-taking).
- Settings page shows per-tier self-test results; a misconfigured tier
  degrades that tier's workers, never the board.
- Core JSON validated on load; an invalid user core falls back to the
  bundled copy with a visible warning in the feed.
- Obsidian export refuses to write outside the configured vault.

## Testing

- `fixtures/mock-provider.mjs`: tiny OpenAI-compatible HTTP server with canned
  chat + embeddings responses, so the full enrichment pipeline runs offline.
- `node --test` units: settings load/merge/env-override, provider payload
  shaping per flags, core loading/validation/fallback, cosine search.
- Real-run verification (per working style): headless `npm start` smoke;
  Electron launch → note → enrichment → /obsidian → /search; provider switch
  to a local endpoint; DMG build opens.

## Out of scope (architected-for, not built)

- Embedded llama.cpp runtime (slots in as another provider later).
- Third-party extension distribution/marketplace.
- Windows/Linux packaging.
