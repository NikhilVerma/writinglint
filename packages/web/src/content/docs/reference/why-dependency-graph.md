---
title: Why a dependency graph
description: What WritingLint can express that regex and POS-only linters can't — and the performance cost of getting there.
---

Prose linters mostly work one of two ways:

- **Regex / pattern rules** — Vale, proselint. Fast, but they see only characters and words. "Avoid
  *utilize*" is easy; "a staged *X, not Y* contrast" is not.
- **Linear POS matching** — Harper's Weir DSL matches on part-of-speech tags in sequence. Richer than
  regex, but still **linear**: it can't express which word governs which.

WritingLint parses each sentence into a **Universal-Dependencies graph** using an owned parser
contract and the independent Stanza reference backend: every token linked to its syntactic **head** by a
labeled **relation** (`nsubj`, `conj`, `advmod`, `amod`, …). Rules match on that structure.

## What that unlocks

The construction that started this project — the corrective **"X, not Y"** antithesis — is a `conj`
dependent whose coordinator is the word *not*, guarded by a comma. Expressed as a graph relation it is
one precise rule that catches:

- "Trust the flags, **not** the number."
- "Choose clarity, **not** cleverness."
- "It's the graph, **not** the vibes."

…and does **not** fire on ordinary negation ("I did **not** see the number"), because that *not* isn't
coordinating anything. No word list can draw that line; a linear POS matcher can't either, because the
distinction is in the head/child structure, not the sequence.

The same is true across the pack: light-verb inflation ("*plays a … role*"), copula avoidance
("*stands as a testament*"), participial appendages ("*…, underscoring the importance of*"). Each is a
shape in the graph.

**Structural tells are also more robust.** Swap synonyms or reorder a keyword-matcher's trigger words
and it goes quiet; the *structure* usually survives the edit. That's the case for parsing over
matching.

## The trade-off: speed

A dependency parser is a real neural model, not a pattern scan. Parsing costs on the order of
**hundreds of milliseconds per document**, versus microseconds for regex. So:

| | Regex / POS linter | WritingLint |
| --- | --- | --- |
| Speed | microseconds | ~ hundreds of ms / doc |
| Sees | characters / POS sequence | full dependency + POS graph |
| Rule power | word lists, linear patterns | head/child relations, subtrees |
| Robust to rewording | brittle | usually survives |

We think the richer rules justify the cost. Two things keep it practical: the model runs **offline and
deterministically** (no API calls, byte-identical output), and in the browser the parse runs in a
**Web Worker** so the editor thread never blocks — you get a spinner, not a freeze.
