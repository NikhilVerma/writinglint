# Confidence and recall calibration

SlopSift keeps broad editorial recall without pretending every match is equally
certain. A weak candidate should become `info`, not disappear. Repetition,
density, location, and independent nearby signals can promote it to `warning`
or `error`.

## July 2026 real-prose calibration

Two private, non-redistributed corpora were used as adversarial regression sets:

- 18 Markdown posts from a personal technical blog
- 16 HTML pages from a product blog

These texts are evaluation inputs, not redistributed training data. Re-run them
locally when changing extraction, source mapping, or the default rulepack.

### Phase 1: precision baseline

The initial run produced 275 findings. Manual review found heavy contamination
from Markdown code, technical symbols, domain vocabulary, ordinary passive
voice, and one-off functional contrasts.

The first calibration pass reduced the corpus to 12 defensible findings:

- 2 chatbot/editorial fillers
- 1 document-level em-dash density warning
- 1 genuinely vague attribution
- 1 duplicated modal from the controlled “can X or Y; both will …” pattern
- 2 rhetorical adjective triads
- 5 corrective-antithesis findings, emitted because the construction repeats
  five times in one article

That pass proved the extraction and structural guards, but it also revealed a
design mistake after confidence levels were introduced: uncertainty was encoded
as suppression. `--level info` could not show candidates that rules had already
discarded.

### Phase 2: confidence-aware recall

A blind review was completed without looking at SlopSift output first. It found
clear weak-writing passages in five posts where the 12-finding build emitted
nothing, including unsupported absolutes, repeated conclusions, mechanical
bold-label outlines, canned tutorial framing, and technically confident claims
without evidence.

The rules now retain those weak candidates and grade them:

- singleton vocabulary, ordinary actorless passives, individual absolutes,
  vague declaratives, and individual em-dash patterns are `info`
- repetition or density promotes absolutes, certainty language, comparisons,
  rhetorical scaffolding, and outline formatting to `warning`
- dense mechanical templates, repeated canonical corrective antithesis, and
  unmistakable chatbot artifacts can become `error`

On the 18-post Markdown corpus, the audited strict run emits 360 findings:

- 30 errors
- 29 warnings
- 301 informational review candidates

Every error and warning was inspected against its source context. That review
demoted a legitimate action checklist, cited and weak comparisons, scoped
technical absolutes, procedural-list vocabulary overlap, and ordinary uses such
as “write clearly.” The large informational tier is intentional. It is the broad
candidate surface for editors and for future classifier training, not a claim
that 301 passages must be changed. The default warning-level view emits 59
findings.

### Multi-scale evidence

The document model exposes blank-line-delimited paragraphs in addition to
sentences and tokens. Rules can run at four stages:

1. sentence/token matches
2. paragraph patterns such as stacked absolutes
3. document patterns such as repeated scaffolding and uniform rhythm
4. `DocumentExit` aggregation over findings emitted by independent rules

The evidence-cluster rule promotes a paragraph only when signals cross rule and
category boundaries. Ordinary passives, individual absolutes, and em dashes
carry fractional supporting weight so they cannot certify a paragraph by
themselves. Overlapping matches on the same phrase are collapsed before
aggregation.

### HTML result

The initial comment-only HTML run produced 50 noisy findings. The first rendered
text run produced 74, dominated by ordinary passive voice and technical arrows.
HTML extraction now preserves block boundaries as blank lines so an entire page
cannot be mistaken for one paragraph. The strict run produces 95 findings: zero
errors, eight warnings, and 87 informational candidates. The three decorative
emoji remain correctly ranged.

## Decisions encoded from the review

- Markdown frontmatter, fenced and indented code, inline code, link targets,
  footnote markers, blockquotes, and attributed footnote quotations are excluded
  from authorial prose.
- HTML is decoded to visible text with a source map; metadata, code, scripts,
  styles, templates, SVG, comments, and attributes are excluded.
- Unicode arrows are technical symbols, not decorative emoji.
- Em-dash use is one graded density diagnostic per document.
- `harness` is ordinary as an engineering noun. A lone AI-vocabulary word is
  informational; density can promote the pattern. Meta-discussion remains
  excluded.
- Ordinary actorless passives are informational. High-accountability actions
  whose actor is concealed are warnings.
- A single rhetorical/copular corrective antithesis is informational.
  Repetition promotes the construction, while functional imperatives remain
  excluded.
- Rule-of-three members must share POS.
- Vague attribution combines a precise dependency match with a broader
  low-confidence phrase layer.
- Absolute claims are requests to verify scope and evidence, never declarations
  that the statement is false.
- Blog-native devices such as headings, metaphors, reader address, and bold
  labels remain low-confidence unless they repeat or combine with other signals.

## Acceptance procedure

For a default-rule change:

1. Run unit and rule tests.
2. Run both real-prose corpora.
3. Inspect every new or changed error and warning with its source context;
   sample the informational tier by rule and source type.
4. Add a minimal positive or negative regression fixture for each generalized
   decision.
5. Never remove a plausible candidate merely to improve precision. Demote it,
   add context, or prevent it from contributing enough evidence to promote.
