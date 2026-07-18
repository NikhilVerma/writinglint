# writinglint-rulepack-ai-style

The AI-writing-style rulepack for [WritingLint](https://github.com/NikhilVerma/writinglint):
authorable rules that match structural "tells" over the dependency graph, plus a
stylometric document scorer. The first pack for the `writinglint-core` engine.

```ts
import { recommended, score } from 'writinglint-rulepack-ai-style';
```

See the [rule reference](https://writinglint.nikhilv.workers.dev/reference/rules/).

## Detection philosophy

The pack treats style patterns as revisable lint suggestions, not proof that a
person used AI. Its taxonomy is informed by public descriptive resources such
as [Wikipedia's “Signs of AI writing” field guide](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
and the MIT-licensed [`hardikpandya/stop-slop`](https://github.com/hardikpandya/stop-slop)
project, then narrowed through dependency structure,
negative controls, and repository-owned tests.

The graph-sensitive rules cover significance inflation, superficial participial
analysis, vague attribution, copula avoidance, negative parallelism, triads,
passive actor hiding, and false agency. Surface and discourse rules cover
formatting artifacts, absolutes, unsupported certainty and comparisons,
mechanical outlines, rhetorical scaffolding, semantic redundancy, uniform
rhythm, and outline-like conclusions.

Detection is multi-scale. Rules can inspect tokens, sentences, paragraphs, or
the whole document. A final evidence rule combines independent weak signals in
the same paragraph or across a document. Low-confidence absolutes, passives,
and em dashes have deliberately small aggregation weights; repetition across
several distinct rule families is what promotes a cluster.

Wikipedia explicitly cautions that its signs are descriptive rather than
prescriptive and are not individually evidence of AI authorship. WritingLint
follows that boundary: findings explain the concrete prose pattern and never
claim authorship detection.
