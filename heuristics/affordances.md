---
id: affordances
name: Affordances (Norman/Gibson)
aliases: [perceived affordances, forcing functions]
source_persons: [James J. Gibson, Donald Norman]
source_texts: ["The Ecological Approach to Visual Perception", "The Design of Everyday Things"]
native_domain: design
formal_shape: verbal
maturity: folk
risk: LOW
tags:
  - ontology/REPRESENTATION
  - ontology/ARCHITECTURE
  - intervention/MODULARISE
  - epistemic/MAP_TERRITORY
  - domain/DESIGN
  - hook/WHEN_STUCK
  - hook/WHEN_THINGS_FEEL_MAGIC
neighbours: ["[[pattern-language]]", "[[niche-construction]]", "[[intentional-stance]]"]
opposites: []
---

> **An object's design signals what actions it makes possible — good design fits the action you want to the action it invites.**

## When it fires
- Users keep doing the "wrong" thing with an interface or tool, then get blamed for it.
- You need behaviour to be discoverable without instructions or training.
- A system technically permits an action but nothing reveals that it's available.

## Questions it forces
- What does this design invite a user to do, regardless of what I intended?
- Where do perceived affordances (what looks possible) diverge from real ones (what is possible)?

## What to do
Make the right action the obviously available one and the wrong action hard or impossible (forcing functions). Match signifiers to capabilities: if it should be pushed, it should look pushable. When errors recur, fix the affordance, not the user.

## Failure mode
Over-constraining removes legitimate flexibility; false affordances (things that look interactive but aren't) frustrate. Skeuomorphism can signal affordances that the system doesn't actually support.

## Out-of-domain example
An API whose function names suggest one behaviour but do another has a broken affordance: callers "misuse" it because the signifier lied. Rename to match the real action and bugs drop.

## Related
A perception-side complement to [[pattern-language]]. Connects to [[niche-construction]]: designers shape the environment that shapes user behaviour.
