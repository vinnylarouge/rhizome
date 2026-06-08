---
id: goodharts-law
name: Goodhart's Law
aliases: [when a measure becomes a target]
source_persons: [Charles Goodhart, Marilyn Strathern]
source_texts: []
native_domain: economics
formal_shape: verbal
maturity: empirical
risk: MEDIUM
tags:
  - ontology/INSTITUTION
  - ontology/INFORMATION_CHANNEL
  - intervention/UNMEASURE
  - epistemic/PROXY_FAILURE
  - domain/ECONOMICS
  - hook/WHEN_METRIC_DOMINATES
  - hook/WHEN_THERE_ARE_SMART_ADVERSARIES
neighbours: ["[[campbells-law]]", "[[cargo-cult-science]]", "[[legibility-trap]]", "[[principal-agent-problem]]"]
opposites: []
---

> **When a proxy becomes a target, optimisation pressure destroys its value as a proxy.**

## When it fires
- A metric is under pressure: a KPI, benchmark, OKR, eval score, or test result that decides rewards.
- Numbers improve while the thing they were supposed to track does not.
- Smart agents have an incentive to game the measure.

## Questions it forces
- What latent variable did this metric once imperfectly track?
- Who benefits from gaming it, and what becomes invisible because it isn't measured?

## What to do
Hold targets loosely: use multiple metrics, rotate them, add audits and qualitative checks, and keep the original *purpose* explicit so you can tell genuine progress from gaming. Where possible, measure outcomes you can't easily fake.

## Failure mode
Not every measure corrupts instantly — under low stakes a proxy can stay useful. Treating all measurement as doomed leads to flying blind, which is worse.

## Out-of-domain example
Optimising a model for chain-of-thought length yields decorative reasoning, not better reasoning: the proxy (more tokens) detaches from the target (correct conclusions) the moment it's rewarded.

## Related
The high-stakes intensification is [[campbells-law]]; a measurement form of the [[legibility-trap]] and a symptom in any [[principal-agent-problem]].
