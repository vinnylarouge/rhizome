---
id: risk-of-ruin
name: Risk of Ruin
aliases: [survival constraint, absorbing barrier]
source_persons: [Nassim Taleb, Warren Buffett]
source_texts: []
native_domain: probability
formal_shape: verbal
maturity: formal
risk: RUIN
tags:
  - intervention/BUFFER
  - epistemic/COUNTERFACTUAL
  - dynamics/RUNAWAY
  - domain/FINANCE
  - hook/WHEN_THERE_IS_RUIN_RISK
  - hook/WHEN_WINNING_TOO_EASILY
neighbours: ["[[margin-of-safety]]", "[[kelly-criterion]]", "[[barbell-strategy]]", "[[circle-of-competence]]"]
opposites: []
---

> **Avoid any path that can reach an absorbing failure state — you can't play if you're out of the game.**

## When it fires
- A strategy has positive average return but a small chance of total, irreversible loss.
- Leverage, correlation, or a long sequence of bets makes wipeout reachable.
- Someone defends a gamble by its *expected value* while ignoring the absorbing barrier.

## Questions it forces
- Is there any sequence of events here that ends the game permanently?
- Am I optimising expectation when I should be optimising survival?

## What to do
Treat ruin as a hard constraint, not a term in an average: cap exposure, refuse uncapped leverage, decorrelate, and ensure that no single bad draw is fatal. Expected value only matters if you survive to collect it.

## Failure mode
Over-applied, it breeds paralysis — every action carries *some* tail risk. The discipline is to separate genuinely absorbing states (death, bankruptcy, lost reputation) from merely painful ones.

## Out-of-domain example
Russian roulette pays well per pull on average; the absorbing barrier makes the expected-value calculation irrelevant. Most real ruin is slower (leverage, untested dependencies) but structurally identical.

## Related
The constraint that [[margin-of-safety]] and [[kelly-criterion]] both serve; the reason a [[barbell-strategy]] keeps one leg perfectly safe.
