---
id: pattern-language
name: Pattern language (Alexander)
aliases: [design patterns, patterns]
source_persons: [Christopher Alexander]
source_texts: ["A Pattern Language", "The Timeless Way of Building"]
native_domain: architecture
formal_shape: verbal
maturity: folk
risk: LOW
tags:
  - ontology/ARCHITECTURE
  - ontology/SEARCH_SPACE
  - intervention/MODULARISE
  - intervention/RECOMPOSE
  - domain/DESIGN
  - hook/WHEN_STUCK
  - hook/WHEN_TOO_COMPLEX
neighbours: ["[[affordances]]", "[[near-decomposability]]", "[[conways-law]]", "[[metis]]"]
opposites: []
---

> **A recurring design problem in a context has a named, reusable solution that resolves the competing forces — and the solutions link into a generative language.**

## When it fires
- The same design tension keeps recurring across projects and people keep re-solving it badly.
- A design feels arbitrary; you can't say why one layout is better than another.
- You want to share design wisdom that's more concrete than principles but more general than one blueprint.

## Questions it forces
- What forces is this design actually trying to balance, before any form is chosen?
- Has someone named this problem-and-resolution already, so I can reuse it?

## What to do
State the problem as a tension between forces, then the form that resolves it, then the context where it applies. Build a vocabulary of such patterns and compose them in sequence — larger patterns set the context for smaller ones. Design forces-first, form-second.

## Failure mode
Patterns calcify into mandatory boilerplate (cargo-culted "design patterns") applied where their forces don't hold, adding ceremony without resolving anything.

## Out-of-domain example
Software design patterns (Observer, Adapter) are a pattern language: each names a recurring code tension and its resolution. Misapplied — a Singleton where you needed none — they become anti-patterns.

## Related
Pairs with [[affordances]] for the perception layer and [[near-decomposability]] for structure. Generates the architecture that [[conways-law]] says mirrors your org.
