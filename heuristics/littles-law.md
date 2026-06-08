---
id: littles-law
name: Little's Law
aliases: [L = λW]
source_persons: [John Little]
source_texts: []
native_domain: operations-research
formal_shape: equation
maturity: theorem
risk: LOW
tags:
  - ontology/QUEUE
  - ontology/FLOW
  - intervention/MEASURE
  - dynamics/LINEAR_RATE
  - domain/QUEUEING
  - hook/WHEN_BACKLOG_GROWS
  - hook/WHEN_THERE_IS_A_BOTTLENECK
neighbours: ["[[kingmans-formula]]", "[[theory-of-constraints]]", "[[stocks-and-flows]]", "[[amdahls-law]]"]
opposites: []
---

> **Average work-in-system = arrival rate × average time-in-system; fix any two and the third is forced.**

## When it fires
- A backlog is growing and you're unsure whether arrivals, throughput, or work-in-progress is to blame.
- Latency is rising while everyone reports being fully busy.
- You want to cut lead time but can only easily measure two of the three quantities.

## Questions it forces
- Is delay driven by arrival rate, service time, or the amount of work in progress?
- If I cap work-in-progress, what does that *force* lead time to become?

## What to do
Pick the lever you control. To cut time-in-system without adding capacity, cap WIP — Little's Law guarantees lead time falls proportionally. Don't add work to a system whose throughput is fixed; you only inflate the queue.

## Failure mode
Holds only in steady state. Under transient shocks or strongly non-stationary arrivals the averages mislead, and a momentary snapshot tells you little.

## Out-of-domain example
A research lab running 30 simultaneous projects feels intellectual latency even though everyone works hard: with throughput fixed, more concurrent work in the system just lengthens every project's time-to-done.

## Related
The steady-state backbone beneath [[kingmans-formula]] and [[theory-of-constraints]]; a flow view of [[stocks-and-flows]].
