# Style guide — writing the roundtable report so it doesn't read as AI

This is a baked-in control surface for the `/compile` pipeline. Its rules are
injected as negative constraints + positive voice targets into every prose-
generation prompt, and a final "smell-check" pass re-checks the assembled draft
against the banned list and rewrites offenders.

## The one finding that matters

The post-LLM signature is overwhelmingly **stylistic, not topical**: the excess
vocabulary in post-ChatGPT text is ~66% verbs and ~18% adjectives — *manner*
words, not subject nouns ([Kobak et al.](https://arxiv.org/html/2406.07016v1)).
So the defense is not to swap one fancy word for another; it is to be **concrete,
committed, and rhythmically uneven**. Specificity (named institutions, figures,
dates, attributed positions) beats every detector because it is the opposite of
the AI default.

## Avoid (negative constraints — injected into generation prompts)

- **Banned word-families** (do not use anywhere): delve, underscore(s),
  intricate, interplay, showcase, leverage (verb), harness, navigate/navigating,
  realm, tapestry, mosaic, fabric, beacon, landscape, ecosystem, paradigm,
  robust, holistic, nuanced, seamless(ly), streamlined, pivotal, groundbreaking,
  transformative, multifaceted, comprehensive, crucial, vibrant, compelling,
  ever-evolving.
- **Banned sentence-opening connectives**: Furthermore, Moreover, Crucially,
  Additionally, Notably, Particularly. Use "also", "and", "but", "so", or no
  connective. At most ~1 adverbial opener per page.
- **Banned antithesis template** (all forms): "It's not just X, it's Y", "This
  isn't about X, it's about Y", "X isn't Y — it's Z". State the point directly.
- **No reflexive tricolons**: at most one deliberate three-part list in the whole
  document; prefer two items or one.
- **No present-participle openers** ("Navigating…", "Recognizing that…",
  "Looking ahead…") and no "From X to Y" templates. Lead with subject + verb.
- **No signposting / meta-commentary**: "It's important to note", "It's worth
  noting", "In this section we will", "As mentioned earlier", "Now that we've
  explored". Just make the point.
- **No restatement endings**: the last paragraph of any section must add a
  recommendation, decision, or consequence — never a recap.
- **Em-dashes**: at most one or two in the entire document. Prefer commas,
  periods, colons, parentheses.
- **No reflexive hedging**: cut "often/typically/generally/can be/may/arguably"
  unless the uncertainty is real and load-bearing — then say *why* (evidence,
  dissent) rather than softening the verb.
- **No false balance**: don't pair every point with a symmetric counterpoint and
  decline to commit. Where the room reached a view, state it.
- **No placeholder examples** ("a company might…"). Use the roundtable's actual
  cases, figures, jurisdictions, dates.
- **No bullet reflex**: bullets only for genuinely enumerable items
  (recommendations, attendees). Reasoning goes in flowing prose.
- **No generic subheadings** ("Understanding X", "The Importance of Y"). Name the
  specific issue.
- **Vary rhythm**: consecutive paragraphs must not run to similar length or follow
  the same claim→explanation→hedge→summary shape.

## Aim for (positive voice targets — Chatham House policy register)

- **Concrete nouns and named referents**: institutions, statutes, dates,
  percentage/£/$ figures, specific models or incidents, attributed positions
  ("Participants from regulators argued…", "One operator noted…").
- **Declarative commitment**: state findings as statements where the room
  converged; attribute disagreement to identifiable camps where it split.
- **Varied rhythm (high burstiness)**: mix short blunt sentences with longer ones;
  some paragraphs two sentences, others eight.
- **Plain register**: short Anglo-Saxon verbs (use, show, found, set, raise, cut)
  over Latinate filler (utilize, facilitate, underscore). Earn each adjective.
- **Operational recommendations**: who does what, by when, and what changes if
  they don't — not aspirations.
- **Logical transitions**: connect with the real relationship ("because", "but",
  "as a result", "the exception was") and often with no connective at all.
- **Resolving endings**: close on a decision, a flagged open question, or a
  consequence.
- **Restraint**: leaving a contrast implicit and committing to one side reads as
  more human than perfect symmetry. Under-polish slightly.
- **Chatham House framing**: report positions and arguments without naming
  individuals where required — but anonymity of speakers is never a license for
  vagueness of content. Keep arguments concrete and conclusions committed.

## Caveat on detection

Individual tells (especially em-dashes) produce false positives and vary by model
— detection is "still more art than science"
([Indiana Capital Chronicle](https://indianacapitalchronicle.com/2025/08/05/too-many-em-dashes-spotting-text-written-by-chatgpt-is-still-more-art-than-science/)).
The smell-check pass therefore flags *clusters* and the banned list, not single
features in isolation, and never rewrites toward blandness.

## Sources (receipts)

- Kobak et al., *Delving into ChatGPT usage… excess vocabulary* — https://arxiv.org/html/2406.07016v1
- *Why Does ChatGPT "Delve" So Much?* — https://arxiv.org/html/2412.11385v1
- *Linguistic Characteristics of AI-Generated Text: A Survey* — https://arxiv.org/abs/2510.05136
- Colin Gorrie, *Why ChatGPT writes like that* (antithesis/tricolon) — https://www.deadlanguagesociety.com/p/rhetorical-analysis-ai
- *Indicators that suggest something was written by AI* — https://www.cherryleaf.com/2026/02/indicators-that-suggest-something-was-written-by-ai/
- *How to Clean Up AI-Generated Drafts* — https://www.louisbouchard.ai/ai-editing/
- *The Ten Telltale Signs of AI-Generated Text* — https://www.theaugmentededucator.com/p/the-ten-telltale-signs-of-ai-generated
- *The Rise of the Em Dash in Ecology Abstracts* — https://www.pieceofk.fr/the-rise-of-the-em-dash-in-ecology-abstracts/
- *Why do AI models use so many em-dashes?* — https://www.seangoedecke.com/em-dashes/
- Em-dash caveat — https://indianacapitalchronicle.com/2025/08/05/too-many-em-dashes-spotting-text-written-by-chatgpt-is-still-more-art-than-science/
- CJR on AI listicles in newsrooms — https://www.cjr.org/feature/fight-over-ai-mcclatchy-union-dog-sidecar-listicle-summary.php
