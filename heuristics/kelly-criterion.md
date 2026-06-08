---
id: kelly-criterion
name: Kelly Criterion
aliases: [Kelly bet, optimal f]
source_persons: [John L. Kelly Jr., Ed Thorp]
source_texts: []
native_domain: information-theory
formal_shape: equation
maturity: theorem
risk: HIGH
tags:
  - intervention/OPTIONALISE
  - epistemic/BAYESIAN_UPDATE
  - dynamics/EXPONENTIAL
  - domain/FINANCE
  - hook/WHEN_THERE_IS_RUIN_RISK
  - hook/WHEN_WINNING_TOO_EASILY
neighbours: ["[[risk-of-ruin]]", "[[margin-of-safety]]", "[[barbell-strategy]]", "[[optionality]]"]
opposites: []
---

> **Bet a fraction of your bankroll proportional to your edge — no more — to maximise long-run growth without going broke.**

## When it fires
- You face repeated risky bets and must choose how much to stake each time.
- An edge exists but is uncertain, and over-betting risks ruin.
- You're sizing positions, not just picking them.

## Questions it forces
- What is my actual edge, and how confident am I in it?
- Is my stake scaled to that edge, or to my enthusiasm?

## What to do
Stake the edge-weighted fraction (bet roughly edge/odds), and when your edge is uncertain, bet *less* — "fractional Kelly" (half or quarter) sacrifices a little growth for much lower volatility. Repeated full-Kelly betting maximises compounding only if the edge is exactly known.

## Failure mode
Catastrophic if you overestimate your edge or the bets are correlated: Kelly assumes accurate probabilities and independent, repeated wagers. One-shot or fat-tailed situations break it.

## Out-of-domain example
Allocating research effort across projects: pour everything into your single best bet and one failure wipes the year; size each project to your genuine confidence and the portfolio compounds.

## Related
Operationalises survival under [[risk-of-ruin]]; its caution mirrors [[margin-of-safety]] and feeds the convex leg of a [[barbell-strategy]].
