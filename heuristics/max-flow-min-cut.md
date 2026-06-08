---
id: max-flow-min-cut
name: Max-Flow Min-Cut
aliases: [max-flow min-cut theorem]
source_persons: [L. R. Ford, D. R. Fulkerson]
source_texts: []
native_domain: graph-theory
formal_shape: graph
maturity: theorem
risk: LOW
tags:
  - ontology/FLOW
  - intervention/BOTTLENECK
  - domain/MATHEMATICS
  - hook/WHEN_THERE_IS_A_BOTTLENECK
  - hook/WHEN_SCALING
neighbours: ["[[amdahls-law]]", "[[theory-of-constraints]]", "[[littles-law]]"]
opposites: []
---

> **The most that can flow through a network equals the capacity of its narrowest cut.**

## When it fires
- Something moves through a multi-stage network — data, goods, approvals, water — and total throughput is disappointing.
- You're tempted to widen many channels at once.
- You need to know the single cheapest place to sabotage or to reinforce a system.

## Questions it forces
- Where is the narrowest cut that separates source from sink?
- Will widening *this* edge raise total flow, or just move the bottleneck?

## What to do
Find the minimum cut and widen exactly there; capacity spent anywhere else is wasted until the cut moves. To *stop* a flow cheaply, sever the min cut instead of attacking everywhere.

## Failure mode
Assumes well-defined capacities and conserved flow. When edges interact, capacities are stochastic, or the "flow" isn't conserved (ideas, morale), the clean duality breaks down.

## Out-of-domain example
An immigration pipeline with fast forms but one understaffed interview stage: the interview is the min cut. Digitising the forms changes nothing until you add interviewers.

## Related
The graph-theoretic twin of [[theory-of-constraints]] and [[amdahls-law]]; bounds a network the way [[littles-law]] bounds a queue.
