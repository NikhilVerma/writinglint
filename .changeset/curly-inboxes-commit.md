---
"writinglint-rulepack-ai-style": minor
"writinglint-rulepack-craft": minor
---

New chatbot-email tells and corporate-register rules.

ai-style gains five rules, corpus-validated at zero human-doc false positives:
`comma-splice` (clipped parataxis — "Thanks for the demo, I enjoyed it."),
`agentless-opener` ("Notes attached, and they are …"), `setup-fragment` ("One
thing I wanted to put on the table …"), `performed-candor` ("to be fully
transparent"), and `filler-intensifiers` ("I am genuinely open"), the latter
three under a new lint-only `performance` category.

craft gains a `register` category with `stacked-nouns` (noun piles) and
`nominalization` ("made a decision" → "decided").
