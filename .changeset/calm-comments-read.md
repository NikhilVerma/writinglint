---
'writinglint-core': minor
'writinglint-rulepack-ai-style': patch
'writinglint-rulepack-reader-first': minor
'slopsift': minor
---

Read a pasted block comment as prose, so `*` line prefixes no longer turn wrapped sentences into bullets and hide their length. Stop flagging `` `label`: verb `` definitions as agentless rationale and "is used to" as a hidden actor. Add `wh-fragment` and `list-without-break` to reader-first. Stop counting clear pronouns and words like the "that" in "prove that" as vague references, stop raising ordinary sentences to warnings only because long sentences are nearby, and add `distant-pronoun`. `sentence-load` now judges structure (how long a subject waits for its verb, how much is open at once, and idea density) instead of length, so length alone earns only a note. It also flags nested subjects, such as a long clause between a subject and its verb, using word order so a parser misreading can't hide them. Its `warningWords` option and the `clause-breaks`, `technical-labels`, `heavy-punctuation` and `nearby-loaded-sentences` metrics are removed.
