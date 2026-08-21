---
'writinglint-rulepack-ai-style': patch
---

`ai-style/throat-clearing` now fires on the phrasing it is named for. It asked
for the "it" in "It is important to note that …" as an `nsubj`, but the parser
labels an expletive subject `expl`, so the rule matched nothing. It now accepts
both, and covers the "it is worth noting that …" frame, which the parser gives
a different shape again.
