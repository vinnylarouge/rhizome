---
id: conways-law
name: Conway's Law
aliases: []
source_persons: [Melvin Conway]
source_texts: []
native_domain: software-engineering
formal_shape: verbal
maturity: empirical
risk: MEDIUM
tags:
  - ontology/ARCHITECTURE
  - ontology/INSTITUTION
  - intervention/MODULARISE
  - domain/ORGANISATION
  - hook/WHEN_SCALING
  - hook/WHEN_TEAMS_MISALIGN
neighbours: ["[[near-decomposability]]", "[[brooks-law]]", "[[transaction-costs]]", "[[principal-agent-problem]]"]
opposites: []
---

> **A system's structure inevitably mirrors the communication structure of the organisation that built it.**

## When it fires
- A system's module boundaries suspiciously match the org chart, not the problem.
- Two teams that don't talk produce two components that don't integrate.
- You're designing architecture and team structure as if they were independent.

## Questions it forces
- What communication structure will this org impose on whatever it builds?
- If I want a particular architecture, what team boundaries must I create to get it?

## What to do
Design teams to match the architecture you *want* (the "inverse Conway manoeuvre"): align team boundaries with intended module boundaries, and invest in cross-team communication exactly where you need components to integrate tightly.

## Failure mode
Treated fatalistically, it excuses bad architecture as inevitable. And reorganising people is costly and slow — sometimes fixing the interface is cheaper than fixing the org.

## Out-of-domain example
A textbook written by ten professors who never coordinated reads as ten disconnected chapters with redundant notation — the document's seams trace the authors' (non-)communication.

## Related
The organisational shadow of [[near-decomposability]]; pairs with [[brooks-law]] on scaling teams and [[transaction-costs]] on where to draw boundaries.
