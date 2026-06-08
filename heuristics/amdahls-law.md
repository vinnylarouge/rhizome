---
id: amdahls-law
name: Amdahl's Law
aliases: [Amdahl bound]
source_persons: [Gene Amdahl]
source_texts: []
native_domain: computer-architecture
formal_shape: equation
maturity: theorem
risk: LOW
tags:
  - ontology/FLOW
  - intervention/BOTTLENECK
  - dynamics/THRESHOLD
  - domain/COMPUTING
  - hook/WHEN_SCALING
  - hook/WHEN_THERE_IS_A_BOTTLENECK
neighbours: ["[[littles-law]]", "[[theory-of-constraints]]", "[[max-flow-min-cut]]"]
opposites: ["[[gustafsons-law]]"]
---

> **Total improvement is capped by the fraction you did not improve.**

## When it fires
- Optimisation has plateaued: many local wins, little global gain.
- You are scaling compute, headcount, or a pipeline and returns are flattening.
- Someone proposes speeding up a part that is not on the critical path.

## Questions it forces
- What fraction of total runtime / cost / attention does this change actually touch?
- Which untouched fraction caps every other improvement?

## What to do
Find and improve the active constraint; stop optimising the parts outside it. If the
serial fraction is 20%, no amount of parallelism beats a 5× speedup — so attack the 20%.

## Failure mode
Assumes a fixed problem size. Under Gustafson-style scaling you grow the problem with the
resource, which changes the denominator and relaxes the bound — see [[gustafsons-law]].

## Out-of-domain example
Hiring ten researchers does not 10× a lab's output if review, strategy, and integration
stay single-threaded. The serial coordination layer is the Amdahl ceiling.

## Related
Generalises into [[theory-of-constraints]]. Shares its flow-ceiling logic with
[[max-flow-min-cut]] and [[littles-law]]. Inverts under [[gustafsons-law]].
