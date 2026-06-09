# Paper grammar — Chatham House-style roundtable report

The generative grammar the `/compile` linearizer targets. Extracted from a corpus
of paradigmatic AI-ethics/policy roundtable reports (sources below), then mapped
onto Loom's `session.json` schema. The linearizer (`src/paper/plan.js`) implements
the ordered section list; the prose generator fills each slot in the prescribed
voice. **This file is a hand-editable control surface** — change the ordering,
voice, or suppression rules here and regenerate.

## Corpus (exemplar sources — receipts)

1. *Artificial Intelligence and International Affairs: Disruption Anticipated* — Chatham House (2018) — https://www.chathamhouse.org/sites/default/files/publications/research/2018-06-14-artificial-intelligence-international-affairs-cummings-roff-cukier-parakilas-bryce.pdf
2. *Regulate to Innovate* — Ada Lovelace Institute (2021) — https://www.adalovelaceinstitute.org/wp-content/uploads/2021/12/Regulate-to-innovate-Ada-report.pdf
3. *AI Safety Governance, the Southeast Asian Way* — Brookings & AI Safety Asia (2025) — https://www.brookings.edu/wp-content/uploads/2025/08/GS_08252025_AISA_report.pdf
4. *Putting Teeth into AI Risk Management* — CSET, Georgetown (2024) — https://cset.georgetown.edu/wp-content/uploads/CSET-Putting-Teeth-into-AI-Risk-Management.pdf
5. *AI Governance: A Research Agenda* — GovAI / FHI, Oxford (2018) — https://cdn.governance.ai/GovAI-Research-Agenda.pdf
6. *AI Risk Management Framework (AI RMF 1.0)* — NIST (2023) — https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf
7. *Recommendation of the Council on Artificial Intelligence* — OECD (2019/2024) — https://legalinstruments.oecd.org/api/print?ids=648&lang=en
8. *2023 Landscape: Confronting Tech Power* — AI Now Institute (2023) — https://ainowinstitute.org/wp-content/uploads/2023/04/AI-Now-2023-Landscape-Report-FINAL.pdf

Academic contrast (FAccT): Abstract → Intro → Related Work → Methods → Results →
Discussion → Limitations → Conclusion. Roundtable reports differ: findings are
*synthesized consensus* (not attributed claims), there is an executive summary and
a recommendations-to-a-named-audience section, and speakers are anonymized.

## The Chatham House Rule (verbatim) + disclaimers

> "When a meeting, or part thereof, is held under the Chatham House Rule,
> participants are free to use the information received, but neither the identity
> nor the affiliation of the speaker(s), nor that of any other participant, may be
> revealed." — https://www.chathamhouse.org/about-us/chatham-house-rule

- **Institutional neutrality:** "X does not express opinions of its own. The
  opinions expressed in this publication are the responsibility of the author(s)."
- **Synthesis / non-endorsement:** recommendations reflect the authors' analysis
  and are "not necessarily the views of the speakers or their affiliated
  organizations… rather than represent direct endorsements by individual
  participants" (Brookings 2025, §1.2).

These are emitted as fixed front-matter boilerplate. The Rule's source URL is the
one *fixed* citation (not produced by the agency) since it is directly verifiable.

## The grammar — ordered sections mapped to `session.json`

`suppress-if-empty` = the section is omitted when its source material is absent
(graceful degradation on sparse sessions). `cite` = section carries verified
external citations from the agency.

| # | Section | Fed by | Voice | cite | suppress-if-empty |
|---|---|---|---|---|---|
| 0 | Front matter / disclaimer | static boilerplate + `session.title` | institutional, fixed | fixed only | no |
| 1 | Executive summary | top themes + key tensions + recommendations (written **last**) | declarative, present tense, no hedging; 1–2 pp | no | no |
| 2 | Introduction / framing | `session.title`, anchors (values/painpoints), the central tension | analytical, sets stakes | no | no |
| 3 | About this convening | session meta (note count, dates), participant archetypes, non-attribution + synthesis disclaimer | plain, procedural | no | no |
| 4 | Findings by theme | emergent `themes` by salience → member `notes`, with their `generalisations` woven in | analytical, evidence-led | no | yes |
| 5 | Tensions & trade-offs | `bridges` where `type==='tension'` (+ notable `echoes`/`causes`) | named & balanced, commits where the room did | no | yes |
| 6 | Conceptual frames | `frames` (metaphors / frames) + spanned themes | interpretive | no | yes |
| 7 | Evidence & caveats | `factChecks` + matching `boundaryConditions` ("true only when…") | rigorous, honest about uncertainty | **yes** | yes |
| 8 | Considerations & emerging principles | `generalisations` (soft, advisory tier) | advisory ("the group's experience suggests…") | no | yes |
| 9 | Recommendations | synthesized from values × painpoints (hard, imperative tier) | imperative, addressed to a named actor, numbered | no | no |
| 10 | Open questions | `kind==='question'` notes + abducted questions | tentative, posed as questions | no | yes |
| 11 | Conclusion | synthesis of stakes + call to action | forward-looking; adds, never recaps | no | no |
| A | Heuristics appendix | `heuristicHits` (name, principle, why, prompting note) | reference | **yes** (provenance) | yes |
| R | References | citation agency output (biblatex) | — | — | yes |

Theme **salience** = note count + bridge degree (themes touched by more bridges
rank higher). Derived (AI-abducted) notes are marked as such; tidied text
(`clean || text`) is used throughout.

## Presentation conventions (enforced by the prose generator)

- **Executive summary is self-contained** and written last; states argument +
  headline recommendations up front; present tense, minimal hedging.
- **Tensions are named, not buried**; where the room reached a view, commit to it;
  where it split, attribute to identifiable camps (anonymized: "regulators
  argued…", "operators countered…").
- **Two-tier laddering:** soft *considerations* (§8, from `generalisations`)
  precede hard *recommendations* (§9). Recommendations are numbered,
  parallel-structured, action-verb-led, and addressed to a named actor.
- **Open questions are a feature** — posed as genuine questions, tentative
  register; they mark what the convening did not resolve.
- **Synthesis under non-attribution:** aggregate ("participants noted…"), never
  "X said"; pair with the synthesis disclaimer.
- **Citations only** in §7 (empirical claims) and the heuristics appendix
  (provenance), per the conservative scope. A claim with no verifiable support is
  flagged `[unsupported]`, never given a fabricated source.
- Style: see `docs/style-guide.md` (anti-AI-tell constraints + voice targets).
