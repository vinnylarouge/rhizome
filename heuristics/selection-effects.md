---
id: selection-effects
name: Selection Effects
aliases: [survivorship bias, selection bias]
source_persons: [Abraham Wald]
source_texts: []
native_domain: statistics
formal_shape: verbal
maturity: empirical
risk: MEDIUM
tags:
  - ontology/REPRESENTATION
  - epistemic/LATENT_VARIABLE
  - intervention/MEASURE
  - domain/STATISTICS
  - hook/WHEN_ALL_EXPLANATIONS_SOUND_TRUE
  - hook/WHEN_WINNING_TOO_EASILY
neighbours: ["[[base-rates]]", "[[regression-to-the-mean]]", "[[null-model]]", "[[campbells-law]]"]
opposites: []
---

> **The sample you can see has been filtered — so the pattern in it may be an artefact of what got excluded.**

## When it fires
- You're learning from successes, survivors, respondents, or whoever made it into the dataset.
- A striking correlation appears in conveniently available data.
- "Everyone who does X succeeds" — but you only meet the ones who succeeded.

## Questions it forces
- Who or what was filtered *out* before this sample reached me?
- Would the apparent pattern survive if I could see the missing cases?

## What to do
Reconstruct the filter and ask where the absent data would sit. Seek the failures, the non-responders, the silent cases — the planes that didn't return. Reason about the population, not the visible survivors.

## Failure mode
Hunting for hidden selection everywhere can become unfalsifiable scepticism; sometimes the sample really is representative. Demand a plausible filtering mechanism before discounting the data.

## Out-of-domain example
Wald's WWII bombers: reinforcing the bullet-riddled areas of *returning* planes is backwards — the planes hit elsewhere never came back, so the unhit areas are the vulnerable ones.

## Related
Why [[base-rates]] from convenience samples mislead; the data-side cousin of [[regression-to-the-mean]], and a route by which [[campbells-law]] distortion hides.
