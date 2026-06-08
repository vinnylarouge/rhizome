---
id: null-model
name: Null Model
aliases: [null hypothesis, what happens by default]
source_persons: []
source_texts: []
native_domain: statistics
formal_shape: verbal
maturity: formal
risk: LOW
tags:
  - epistemic/NULL_MODEL
  - epistemic/EMPIRICAL_CHECK
  - intervention/SIMPLIFY
  - domain/STATISTICS
  - hook/WHEN_THINGS_FEEL_MAGIC
  - hook/WHEN_ALL_EXPLANATIONS_SOUND_TRUE
neighbours: ["[[base-rates]]", "[[regression-to-the-mean]]", "[[selection-effects]]", "[[cargo-cult-science]]"]
opposites: []
---

> **Before explaining a pattern, ask what it would look like if nothing special were going on.**

## When it fires
- A pattern seems to demand a clever causal story.
- You're about to attribute structure to randomness, trend, or chance clustering.
- Someone presents a result without a baseline to compare it against.

## Questions it forces
- What does the no-effect, no-cause default actually predict here?
- Is the observed pattern distinguishable from that default?

## What to do
Build the dumbest plausible baseline — random chance, "no change", a coin flip, last value carried forward — and check whether your data actually beats it. Only the excess over the null needs explaining; everything up to the null is free.

## Failure mode
A badly specified null (too strong or too weak) rigs the comparison. And insisting on a formal null where the effect is obvious wastes effort on ceremony.

## Out-of-domain example
A "hot streak" in basketball shooting largely vanishes against a null model of independent shots at each player's base rate — much of the perceived streakiness is what randomness looks like.

## Related
Generalises [[base-rates]] and [[regression-to-the-mean]] into a habit; the discipline [[cargo-cult-science]] demands before believing a result.
