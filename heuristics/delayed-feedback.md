---
id: delayed-feedback
name: Delayed Feedback
aliases: [feedback delay, lag-induced oscillation]
source_persons: [Jay Forrester, Donella Meadows]
source_texts: []
native_domain: system-dynamics
formal_shape: loop
maturity: formal
risk: MEDIUM
tags:
  - ontology/CONTROL_LOOP
  - intervention/ATTENUATE
  - dynamics/OSCILLATION
  - domain/CYBERNETICS
  - hook/WHEN_SYSTEM_RESISTS
  - hook/WHEN_THINGS_FEEL_MAGIC
neighbours: ["[[stocks-and-flows]]", "[[requisite-variety]]", "[[policy-resistance]]", "[[ooda-loop]]"]
opposites: []
---

> **Acting on a stale signal causes overshoot and oscillation, even when everyone acts rationally.**

## When it fires
- A system swings between too-much and too-little instead of settling.
- There's a lag between action and visible result, so corrections arrive late.
- Boom-bust cycles appear with no external cause.

## Questions it forces
- How old is the signal I'm reacting to?
- Is this oscillation caused by delay in the loop rather than by any shock?

## What to do
Shorten the feedback delay if you can; if you can't, *slow your response* and act on the trend, not the latest reading. Over-reacting to lagged data is what creates the swings — damp the gain.

## Failure mode
Some oscillation is driven by genuine external forcing, not internal delay; damping then just makes you sluggish. Diagnose the source before detuning.

## Out-of-domain example
A shower with slow-responding taps: react to the current temperature and you scald, then freeze, then scald. The fix is to wait for each adjustment to register — reduce loop gain.

## Related
The dynamic that makes [[stocks-and-flows]] dangerous; the enemy that tight [[ooda-loop]] tempo and [[requisite-variety]] address.
