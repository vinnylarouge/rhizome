---
id: stocks-and-flows
name: Stocks and Flows
aliases: [stock-flow separation]
source_persons: [Jay Forrester, Donella Meadows]
source_texts: ["Thinking in Systems"]
native_domain: system-dynamics
formal_shape: verbal
maturity: formal
risk: LOW
tags:
  - ontology/SYSTEM
  - ontology/FLOW
  - intervention/MEASURE
  - dynamics/HYSTERESIS
  - domain/CYBERNETICS
  - hook/WHEN_BACKLOG_GROWS
  - hook/WHEN_THINGS_FEEL_MAGIC
neighbours: ["[[littles-law]]", "[[delayed-feedback]]", "[[leverage-points]]", "[[policy-resistance]]"]
opposites: []
---

> **A stock accumulates; a flow changes it — and you cannot understand a level by staring at its current value alone.**

## When it fires
- A quantity (debt, trust, skill, backlog, CO₂) keeps drifting despite attention to its current level.
- People react to the *amount* when the *rate of change* is the real story.
- A problem improves slowly even after the inflow stops.

## Questions it forces
- Is this a stock (an accumulation) or a flow (a rate)?
- Even if I shut the inflow off now, how long will the stock take to drain?

## What to do
Separate them explicitly. To change a stock you must change its in- or out-flows, and bathtub dynamics mean change lags: a stock keeps rising while inflow merely exceeds outflow. Manage the rates, and expect delay.

## Failure mode
Over-modelling: not every situation needs a stock-flow diagram, and mislabelling a flow as a stock (or vice versa) produces confident nonsense.

## Out-of-domain example
Technical debt is a stock. A team that "stopped adding debt" still groans under the accumulated level; only sustained *repayment flow* drains it, and slowly.

## Related
The accumulation view underlying [[littles-law]]; pairs with [[delayed-feedback]] and locates [[leverage-points]].
