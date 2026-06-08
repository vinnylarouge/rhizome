---
id: brooks-law
name: Brooks's Law
aliases: []
source_persons: [Fred Brooks]
source_texts: ["The Mythical Man-Month"]
native_domain: software-engineering
formal_shape: verbal
maturity: empirical
risk: MEDIUM
tags:
  - ontology/INSTITUTION
  - intervention/DECOMPOSE
  - dynamics/POWER_LAW
  - domain/ORGANISATION
  - hook/WHEN_SCALING
  - hook/WHEN_BACKLOG_GROWS
neighbours: ["[[conways-law]]", "[[amdahls-law]]", "[[near-decomposability]]", "[[transaction-costs]]"]
opposites: []
---

> **Adding people to a late project makes it later — communication overhead grows faster than added output.**

## When it fires
- A project is behind and the instinct is to throw more bodies at it.
- Coordination cost is rising faster than headcount delivers.
- Onboarding new members consumes the veterans who should be delivering.

## Questions it forces
- Will new people add more throughput than the communication and ramp-up cost they impose?
- Is this work even partitionable, or is it sequential and unsplittable?

## What to do
Resist late staffing; instead cut scope, fix the bottleneck, or restructure into independently shippable pieces *before* adding people. If you must add, add early and in cohesive teams aligned to module boundaries — n people create ~n²/2 communication links.

## Failure mode
Not universal: genuinely partitionable work with low coordination needs *can* absorb more people. The law bites hardest on tightly-coupled, late-stage tasks.

## Out-of-domain example
Nine women cannot make a baby in one month: a strictly sequential task gains nothing from parallel labour, no matter how many workers you assign.

## Related
A staffing instance of [[amdahls-law]]'s serial ceiling; its cure is the [[near-decomposability]] that [[conways-law]] and [[transaction-costs]] also push toward.
