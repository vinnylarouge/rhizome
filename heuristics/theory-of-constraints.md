---
id: theory-of-constraints
name: Theory of Constraints
aliases: [TOC, the bottleneck principle]
source_persons: [Eliyahu Goldratt]
source_texts: ["The Goal"]
native_domain: operations-management
formal_shape: verbal
maturity: empirical
risk: LOW
tags:
  - ontology/SYSTEM
  - ontology/FLOW
  - intervention/BOTTLENECK
  - domain/ORGANISATION
  - hook/WHEN_THERE_IS_A_BOTTLENECK
  - hook/WHEN_STUCK
neighbours: ["[[amdahls-law]]", "[[max-flow-min-cut]]", "[[littles-law]]", "[[leverage-points]]"]
opposites: []
---

> **Every system's throughput is set by one active constraint; improving anything else just builds inventory in front of it.**

## When it fires
- Local efficiencies everywhere, yet end-to-end output won't budge.
- Teams optimise their own stage and the whole still lags.
- You face many possible improvements and limited effort.

## Questions it forces
- What is the single constraint that currently gates the whole system?
- Is every other "improvement" actually piling work in front of it?

## What to do
Run the five focusing steps: **identify** the constraint, **exploit** it (waste none of its capacity), **subordinate** everything else to it, **elevate** it (add capacity), then **repeat** — because once you fix it, the constraint moves and your attention must move with it.

## Failure mode
Mis-identifying the constraint sends all effort to the wrong place. In systems with multiple shifting or policy constraints (rather than a physical one), the "single bottleneck" picture oversimplifies.

## Out-of-domain example
A startup whose engineering ships fast but whose sales-onboarding is the constraint: hiring more engineers grows the backlog of unsold features. The leverage is entirely in onboarding.

## Related
The management generalisation of [[amdahls-law]] and [[max-flow-min-cut]]; constraints are high-leverage points in [[leverage-points]].
