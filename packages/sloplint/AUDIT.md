# Blind blog audit

On 17 July 2026, an independent review examined the 18 Markdown posts in
`nikhil-verma-com/src/content/blog` before looking at Sloplint output or rule
implementations. Confidence in this document means confidence that prose needs
editorial review, not confidence about who authored it.

## What the 12-finding build missed

Five posts with clear weak-writing candidates received zero findings. The blind
review found these recurring families:

- mechanical bold-label lists and repeated outline sections
- absolute technical claims and unbenchmarked comparative outcomes
- the same explanation or conclusion repeated across nearby paragraphs
- canned tutorial collaboration such as “let me walk you through”
- title/section scaffolding whose density becomes visible only at document scale
- broad population claims without a source or scoped personal observation
- stacked metaphors and manufactured punch cadence
- internal contradictions and confident causal stories that do not cohere

Representative examples included an enum constraint described as making
hallucination impossible, a table assigning “Complete” and “Very high” outcomes
without measurements, multiple sequences of bold “Why this works / When to use
this / Pro tip” labels, and conclusions that restated the same harness-over-model
claim three times.

## What is now deterministic

The rulepack now covers broad candidates for absolutes, certainty language,
comparisons, vague quantifiers, mechanical outlines, rhetorical scaffolding,
semantic redundancy, outline conclusions, and uniform rhythm. It also restores
single AI-vocabulary, passive, em-dash, and corrective-antithesis candidates as
information rather than deleting them.

Paragraph and document aggregation can promote independent co-located signals.
Overlap collapse and fractional weights prevent a passive plus an absolute from
certifying a paragraph by themselves.

## What still needs a semantic model

Deterministic rules cannot reliably decide whether:

- two differently worded paragraphs make the same claim
- a causal explanation contradicts the code or call sequence it describes
- a claim conflicts with another paragraph elsewhere in the article
- a statistic, comparison, or technical guarantee is supported by its citation
- an analogy is technically incoherent despite being grammatically ordinary

These are the best targets for a small paragraph-pair classifier or NLI-style
model. Candidate generation should remain deterministic; the model should grade
the candidate with the relevant neighboring paragraph, evidence marker, and
rule signals rather than judge authorship from raw prose.

## False-positive boundary

Blog prose legitimately uses headings, second person, anecdotes, rhetorical
questions, metaphor, bold labels, and fragments. A singleton is informational
at most. Promotion requires repetition, a strong template, or independent
co-signals. Messages critique the writing and ask for scope or evidence; they do
not label a statement false or claim that AI wrote it.
