# Rhizome

<p align="center">
  <img src="docs/demo.gif" alt="Rhizome replaying a live discussion: scribe notes stream in and self-organise into a knowledge graph with themes, bridges and live fact-checks" width="900" />
</p>

<p align="center">
  <a href="https://github.com/vinnylarouge/rhizome/releases/latest">
    <img src="https://img.shields.io/badge/Install%20for%20macOS-Download%20DMG-e8b04b?style=for-the-badge&logo=apple&logoColor=white" alt="Install Rhizome for macOS" />
  </a>
  <a href="https://github.com/vinnylarouge/rhizome/releases/latest">
    <img src="https://img.shields.io/badge/Install%20for%20Linux-AppImage%20%C2%B7%20deb-4ea0e0?style=for-the-badge&logo=linux&logoColor=white" alt="Install Rhizome for Linux" />
  </a>
  <a href="https://github.com/vinnylarouge/rhizome/releases/latest">
    <img src="https://img.shields.io/badge/Install%20for%20Windows-Setup.exe-b483e6?style=for-the-badge&logoColor=white" alt="Install Rhizome for Windows" />
  </a>
</p>

Type terse scribe notes during a discussion; the room watches a knowledge graph
self-organise, with relevant **heuristics** and live **fact-checks / boundary
conditions** streaming into the margins. Afterwards: a cited LaTeX report
(`/compile`), an Obsidian vault export (`/obsidian`), and AI search across every
session you've ever run (`/search`).

Rhizome is loom (built for the HAI Lab / Institute for Ethics in AI roundtable)
grown into a macOS app with three axes of configurability:

- **Providers** — tokens served by an OpenAI API key *or* any local
  OpenAI-compatible server (Ollama, LM Studio, llama.cpp, vLLM), mixable per
  model tier in Settings.
- **Cores** — what a discussion *is* (seed anchors, note taxonomy, worker
  prompts) lives in editable JSON bundles. Ships with `roundtable`,
  `retrospective`, and `design-crit`.
- **Extensions** — Obsidian export and AI search ship as built-in extensions;
  drop your own in `…/Rhizome/extensions/<name>/index.mjs`.

## Install

All installers are on the **[latest release](https://github.com/vinnylarouge/rhizome/releases/latest)**.

**macOS** (Apple Silicon): download the `.dmg`, drag Rhizome to Applications,
then **right-click → Open** the first time (the build is unsigned, so macOS
asks once).

**Linux** (x64 or arm64): download the `.AppImage`, then

```bash
chmod +x Rhizome-*.AppImage && ./Rhizome-*.AppImage
```

(needs FUSE, as most AppImages do — or run with `--appimage-extract-and-run`).
On Debian/Ubuntu the `.deb` works too: `sudo apt install ./rhizome_*_amd64.deb`.

**Windows** (x64): download and run `Rhizome-Setup-*.exe` (per-user install, no
admin). The build is unsigned, so SmartScreen asks once — **More info → Run
anyway**. "Update from Git" on Windows opens the releases page instead; run the
new installer and it updates in place.

Add an OpenAI API key — or point a tier at a local model server — in
**Settings (⚙)** and you're live. Without any provider, note-taking and the
graph still work; only the AI enrichment waits.

## Quick start (from source)

**As the app:**

```bash
npm install
npm start          # Electron app; user data in ~/Library/Application Support/Rhizome
npm run dist       # build dist/…/Rhizome.app + DMG (unsigned: right-click → Open once)
```

**Headless (dev / projector box):**

```bash
npm run serve      # → http://localhost:7777, user data in ./data
```

Either way the board is plain HTTP — open the app's URL from any browser on
the network for the projector (`Session ▸ Open on this network…` shows the LAN
URL). Note-taking works without any AI configured; enrichment lights up once a
provider passes its self-test.

## Configuring models

Settings (⚙ or `/settings`) → add providers and point each **tier** at one:

| tier | runs | default |
|---|---|---|
| fast | triage / themes / bridges / heuristics | `gpt-5.4-mini` @ OpenAI |
| strong | fact-check / `/abstract` / `/saymore` | `gpt-5.4` @ OpenAI |
| paper | `/compile` citations + prose | `gpt-5.5` @ OpenAI |
| embeddings | `/search` index | `text-embedding-3-small` @ OpenAI |

Tiers mix freely — e.g. local Ollama (`llama3.3`) for the live workers, OpenAI
only for `/compile`. Local providers can't do the web-search citation pass;
`/compile` then proceeds citation-free rather than inventing sources (the
existing no-fabrication contract). Settings apply immediately — no restart.

For headless dev, `.env` in the repo still works (`OPENAI_API_KEY`,
`LOOM_FAST_MODEL`, …) and overrides `settings.json`.

## Sessions

Every discussion is a session (title + core), stored under
`…/Rhizome/sessions/<id>/` — `session.json` (atomic-written), `events.jsonl`
(append-only), `costs.jsonl`, `papers/`. The library (⛁ or `/sessions`) lists,
resumes, and archives; **nothing is ever deleted** — archiving moves the folder
to `sessions/.archive/`. Old single-session loom data migrates automatically on
first boot.

## Cores

A core is one JSON file: anchors (with colours), note kinds, every worker
prompt, abduction targets, and how `/compile` maps material. Bundled cores are
seeded to `…/Rhizome/cores/` on first run — edit them there (your edits are
never clobbered; invalid JSON falls back to the bundled copy, loudly). Add a
new discussion type by copying a folder and editing `core.json` — no code.

## Using it live

Unchanged from loom: one input field, type fast, ⏎ commits; notes render
before any AI runs; **⏸ Pause AI** stops all outbound calls instantly. Commands:
`/auto`, `/organise`, `/abduct`, `/abstract`, `/chunk`, `/merge`, `/saymore`,
plus `/sessions`, `/settings`, `/search`, `/obsidian`, `/index`, `/compile
[academic|roundtable|policy]`. After the session: `npm run export` (Markdown
scaffold), `npm run cost` (per-worker spend), `/compile` (cited PDF — needs
`latexmk` + `biber`).

## Obsidian

Set the vault folder in Settings (native picker in the app). `/obsidian`
writes `«vault»/Rhizome/<session-title>/`: an index note plus one wikilinked
note per theme, frontmatter throughout, newest compiled PDF copied alongside.
Only that folder is ever written.

## Search

`/search` (⌘K in the app) searches notes and themes across all sessions —
semantic via the embeddings tier, with honest substring fallback when none is
configured. The index grows as notes are enriched; `/index` backfills old
sessions.

## Updating

- **Cores / extensions / settings** are data — edit and go.
- **The app**: `Rhizome ▸ Update from Git…` (or `npm run update`) pulls this
  repo, runs the tests, rebuilds, swaps `/Applications/Rhizome.app`, relaunches.

## Releasing

```bash
npm version minor              # bump + tag
git push --follow-tags         # CI builds + tests macOS, Linux and Windows, attaches installers
```

GitHub Actions (`.github/workflows/release.yml`) does the rest; the install
buttons always point at the newest release. Local builds: `npm run dist`
(macOS) / `npm run dist:linux` / `npm run dist:win`.

## Morning-of checklist

1. Launch Rhizome; confirm every tier's **Test** passes in Settings.
2. New session → throwaway note → watch a theme/bridge form → archive it.
3. Confirm venue wifi (only API calls need it; the graph renders offline).
4. Projector: `Session ▸ Open on this network…`, open that URL in the
   projector's browser.

## Layout

```
electron/   main.js (shell: utilityProcess server, menu, IPC) · preload.cjs
src/        server.js · store.js (sessions) · workers.js · llm.js (providers)
            settings.js · cores.js · paths.js · cost.js · heuristics.js
  extensions/  index.js (registry) · obsidian.js · search.js
  paper/    plan / cite / style / prose / latex / compile   (the /compile pipeline)
cores/      roundtable/ · retrospective/ · design-crit/     (seeded to user dir)
public/     index.html · app.js · graph.js (D3) · library.js · search.js · settings.js
scripts/    update.sh · export.js · cost.js · reset.js · session-dir.js
fixtures/   mock-provider.mjs (offline OpenAI-compatible mock) · sample-session.json
test/       node --test suites (settings, llm, cores, store, search)
heuristics/ 50 heuristic docs (vendored)
```

## Resilience notes

- **Note-taking never depends on the network.** Notes commit and render before
  any API call; enrichment is queued and additive.
- **Crash-safe.** Atomic session writes + append-only event log; the shell
  auto-restarts the server process; reload/restart and the session is intact.
- **Privacy.** All state stays local. Only note text goes to the configured
  provider — which can be a model on your own machine.
