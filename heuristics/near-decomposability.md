---
id: near-decomposability
name: Near-Decomposability
aliases: [nearly decomposable systems]
source_persons: [Herbert Simon]
source_texts: ["The Sciences of the Artificial"]
native_domain: systems-theory
formal_shape: verbal
maturity: formal
risk: LOW
tags:
  - ontology/ARCHITECTURE
  - ontology/SYSTEM
  - intervention/MODULARISE
  - intervention/DECOMPOSE
  - domain/DESIGN
  - hook/WHEN_SCALING
  - hook/WHEN_TOO_COMPLEX
neighbours: ["[[conways-law]]", "[[pattern-language]]", "[[theory-of-constraints]]"]
opposites: []
---

> **Complex systems that survive are built from weakly-coupled modules with strong internal cohesion.**

## When it fires
- A system has grown until any change ripples unpredictably everywhere.
- You're scaling and tight coupling makes parts impossible to reason about in isolation.
- You need to evolve one component without re-verifying the whole.

## Questions it forces
- Which interactions are strong-and-internal versus weak-and-cross-module?
- Can I draw boundaries where coupling is naturally thinnest?

## What to do
Cut the system along its weakest interactions so that short-run behaviour is dominated by within-module dynamics and only the slow aggregates leak across boundaries. Design interfaces at those seams; this is what lets parts be understood, tested, and replaced independently.

## Failure mode
Forcing modularity where the coupling is genuinely irreducible creates leaky abstractions worse than the monolith. Some problems are not nearly decomposable.

## Out-of-domain example
A body's organ systems interact weakly minute-to-minute (you can study circulation largely apart from digestion) but couple over the long run — which is exactly why physiology is learnable at all.

## Related
The design principle [[conways-law]] warns you'll mirror in your org chart; the structural basis of a [[pattern-language]].
