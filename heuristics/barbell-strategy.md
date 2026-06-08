---
id: barbell-strategy
name: Barbell Strategy
aliases: [barbell allocation]
source_persons: [Nassim Taleb]
source_texts: ["Antifragile"]
native_domain: finance
formal_shape: verbal
maturity: folk
risk: MEDIUM
tags:
  - intervention/BUFFER
  - intervention/OPTIONALISE
  - dynamics/POWER_LAW
  - domain/FINANCE
  - hook/WHEN_THERE_IS_RUIN_RISK
  - hook/WHEN_COSTS_SHIFT
neighbours: ["[[optionality]]", "[[risk-of-ruin]]", "[[margin-of-safety]]", "[[kelly-criterion]]"]
opposites: []
---

> **Combine extreme safety with a sliver of extreme upside, and avoid the fragile middle entirely.**

## When it fires
- The environment is fragile, fat-tailed, or unpredictable.
- A "moderate-risk" balanced position would actually carry hidden tail exposure.
- You want exposure to big upside without risking ruin.

## Questions it forces
- Can I split this into a maximally safe core and a small, capped, high-convexity bet?
- Is my "moderate" allocation secretly exposed to a tail that could wipe me out?

## What to do
Put most of your resources in something that cannot blow up, and a small fraction in many cheap bets with unlimited upside. Skip the deceptive middle, where you take on tail risk without tail reward. The safe leg guarantees survival; the convex leg captures the jackpot.

## Failure mode
Mis-sizing the risky leg (too large) reintroduces ruin; too small forfeits the upside. And "safe" must be genuinely safe — a barbell anchored on a fragile core is just disguised risk.

## Out-of-domain example
A researcher spends 90% of effort on solid incremental work and 10% on wild high-risk ideas, avoiding the mushy middle of medium-novelty projects that rarely break through.

## Related
A structural way to hold [[optionality]] while respecting [[risk-of-ruin]]; its safe leg embodies [[margin-of-safety]], its risky leg is [[kelly-criterion]]-sized.
