---
id: kingmans-formula
name: Kingman's Formula
aliases: [VUT equation, heavy-traffic approximation]
source_persons: [John Kingman]
source_texts: []
native_domain: queueing-theory
formal_shape: equation
maturity: formal
risk: MEDIUM
tags:
  - ontology/QUEUE
  - intervention/BUFFER
  - dynamics/RUNAWAY
  - domain/QUEUEING
  - hook/WHEN_BACKLOG_GROWS
  - hook/WHEN_SCALING
neighbours: ["[[littles-law]]", "[[theory-of-constraints]]", "[[margin-of-safety]]"]
opposites: []
---

> **Queue delay explodes as utilisation approaches 100% — and the more variable the work, the sooner it blows up.**

## When it fires
- A system runs "efficiently" near full capacity and waiting times are suddenly terrible.
- Someone proposes pushing utilisation higher to save money.
- Work or arrivals are bursty and irregular, not smooth.

## Questions it forces
- How close to 100% utilisation are we actually running?
- Is the pain coming from high load, or from variability in arrivals and service times?

## What to do
Keep slack: design for utilisation well below 100% (delay scales like 1/(1−ρ)). If you can't lower load, attack variability instead — smooth arrivals, standardise service times — because delay rises with the *square* of variability.

## Failure mode
An approximation valid near heavy traffic; at low utilisation it overstates delay, and it assumes a single stable queue rather than a transient surge.

## Out-of-domain example
A hospital running its beds at 98% occupancy has no buffer for a bad night; admissions back up catastrophically. The "wasteful" empty 15% is what keeps wait times sane.

## Related
Sharpens [[littles-law]] by adding variability; a queueing case for the [[margin-of-safety]].
