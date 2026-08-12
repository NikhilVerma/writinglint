# SlopSift agent reference

SlopSift 0.8.2 is a deterministic, local-first linter for recognizable AI-writing habits. It parses grammatical relationships, runs named rules, and returns exact source ranges. A finding is an editorial signal, not evidence of authorship.

## CLI

```sh
bunx slopsift .
npx slopsift "docs/**/*.md"
npx slopsift . --format compact --exit-zero
npx slopsift . --level info --format json --exit-zero
npx slopsift . --rulepack ai-style --rulepack reader-first
```

Node.js 20 or newer is required. The npm package includes the compact parser weights. Normal CLI use does not require Python, an API key, or a hosted inference service.

## Inputs

- Markdown, MDX, reStructuredText, AsciiDoc, and plain text are linted as prose.
- HTML is linted as rendered text. Metadata, scripts, styles, templates, SVG, code blocks, and comments are excluded.
- Supported source files are linted through their comments.
- Dependencies, generated output, Git metadata, and paths ignored by `.gitignore` are skipped by default.

## Finding levels

- `error`: high-confidence, specific signature. Exits with status 1.
- `warn`: likely issue requiring editorial judgment. Reported by default.
- `info`: broad review candidate. Included with `--level info`.

`--max-warnings 0` makes warnings fail the command. `--exit-zero` keeps lint findings visible without returning status 1. Configuration and runtime failures still return status 2.

## Output formats

- `text`: human-readable terminal report. `stylish` remains an alias.
- `compact`: all rule groups and counts with short examples and no source locations. `--feedback compact` is an alias.
- `json`: one JSON array. See [schema](https://slopsift.dev/schemas/slopsift-result-v1.schema.json).
- `json-lines`: one file result per line, following `$defs.fileResult` in the schema.
- `github`: GitHub Actions workflow annotations.

JSON messages include an ESLint-compatible numeric severity, SlopSift's textual level, confidence, exact range, rule URL, word count, and findings per thousand words.

## Rulepacks

The default rulepack is `ai-style`. The independent `reader-first` pack applies general simplified-technical-writing principles: introduce terms, show relationships, keep one main point visible, and remove unnecessary ornament. It does not include an external controlled dictionary or claim compliance with an external standard. Repeat `--rulepack` to combine packs. For agent responses, use both.

## In-process API

```ts
import { createSlopSift } from 'slopsift';

const slopsift = await createSlopSift();
const result = await slopsift.lintSource('draft.md', text, {
  level: 'warning',
  rulepacks: ['ai-style', 'reader-first'],
});
```

One `SlopSift` instance reuses its local parser. `lintSource` returns exact source ranges and does not upload the text.

## Stop hook

```sh
npx --yes slopsift@latest hook stop --rulepack ai-style --rulepack reader-first --feedback compact
```

Pass the Claude Code or Codex Stop event as JSON on stdin. The command writes one JSON decision to stdout. Compact feedback groups repeated findings, omits response locations that the model already has in context, and shows up to 100 findings by default. Use `--feedback detailed` for file-oriented diagnostics.

Running the command directly does not install a hook. For a user-level installation, use the maintained plugin for each installed host. These commands preserve other hooks and settings.

Claude Code:

```sh
claude plugin marketplace add NikhilVerma/writinglint
claude plugin install --scope user slopsift@slopsift
```

Codex:

```sh
codex plugin marketplace add NikhilVerma/writinglint
codex plugin add slopsift@slopsift
```

Start a new session after installation. Approve the hook if the client asks for trust. Test it with one response that should be rejected and one clean rewrite that should pass. Do not enable dirty-tree or transcript checks unless the user requests them.

## Exit codes

- `0`: accepted result, including lint findings when `--exit-zero` is set.
- `1`: findings crossed the configured error or warning threshold.
- `2`: invalid arguments, unmatched required patterns, configuration failure, model failure, or runtime failure.

## Agent workflow

1. Run SlopSift using the repository's existing package manager.
2. Use `--format json --exit-zero` for structured editorial review.
3. Inspect the exact range and surrounding paragraph.
4. Preserve facts, technical terms, modality, and the writer's voice.
5. Rerun the same command after editing.
6. Do not optimize for zero low-confidence findings.

Install the maintained [SlopSift Agent Skill](https://skills.sh/NikhilVerma/slopsift) for the complete editing procedure.

## Rule catalogue

- [ai-style/evidence-cluster](https://slopsift.dev/rules/evidence-cluster/): Several independent slop signals cluster in one paragraph or across the document. (warn, document context)
- [ai-style/copula-avoidance](https://slopsift.dev/rules/copula-avoidance/): “stands/serves as a …” dressing up a plain “is a …”. (warn, dependency graph)
- [ai-style/light-verb-role](https://slopsift.dev/rules/light-verb-role/): “plays a … role”, importance asserted, not shown. (info, dependency graph)
- [ai-style/participial-appendage](https://slopsift.dev/rules/participial-appendage/): Trailing “-ing” clause that editorialises the main clause. (info, dependency graph)
- [ai-style/significance-idioms](https://slopsift.dev/rules/significance-idioms/): Fixed “inflated significance” idioms (rich tapestry, testament to …). (warn, text pattern)
- [ai-style/binary-outcome-frame](https://slopsift.dev/rules/binary-outcome-frame/): Mirrored clauses compress a graded process into a polished right-versus-wrong outcome pair. (warn, dependency graph)
- [ai-style/corrective-antithesis](https://slopsift.dev/rules/corrective-antithesis/): The “X, not Y” staged contrast, a modern-AI cadence that adds no information. (warn, dependency graph)
- [ai-style/negative-contrast](https://slopsift.dev/rules/negative-contrast/): A negative declaration followed by a dramatic positive redefinition. (warn, dependency graph)
- [ai-style/negative-list-buildup](https://slopsift.dev/rules/negative-list-buildup/): Repeatedly lists what something is not before revealing the point. (warn, dependency graph)
- [ai-style/negative-parallelism](https://slopsift.dev/rules/negative-parallelism/): “Not (only) X but (also) Y”, a signature LLM cadence. (warn, dependency graph)
- [ai-style/promo-idioms](https://slopsift.dev/rules/promo-idioms/): Travel-brochure / press-release idioms (nestled in the heart of …). (warn, text pattern)
- [ai-style/absolute-claim](https://slopsift.dev/rules/absolute-claim/): An absolute or universal claim that may exceed the evidence or omit its scope. (info, document context)
- [ai-style/claim-evidence-gap](https://slopsift.dev/rules/claim-evidence-gap/): Nearby prose stacks outcome claims without measurements, sources, examples, or a mechanism. (warn, dependency graph)
- [ai-style/undefined-key-term](https://slopsift.dev/rules/undefined-key-term/): A central term is introduced indefinitely, repeated across the document, and asked about without being defined. (info, dependency graph)
- [ai-style/unsupported-certainty](https://slopsift.dev/rules/unsupported-certainty/): Confidence language that asserts a conclusion without showing the evidence. (info, document context)
- [ai-style/unsupported-comparison](https://slopsift.dev/rules/unsupported-comparison/): A comparative, superlative, or outcome claim without an explicit benchmark in the phrase. (info, text pattern)
- [ai-style/vague-attribution](https://slopsift.dev/rules/vague-attribution/): A bare, generic subject asserting a “that …” clause. Name who, or cut it. (warn, dependency graph)
- [ai-style/vague-declarative](https://slopsift.dev/rules/vague-declarative/): An abstract announcement or vague “this approach…” claim that may need a concrete subject. (info, document context)
- [ai-style/vague-quantifier](https://slopsift.dev/rules/vague-quantifier/): A broad population claim without a named sample, source, or scope. (info, document context)
- [ai-style/chatbot-idioms](https://slopsift.dev/rules/chatbot-idioms/): Editorialising / chatbot filler idioms (it’s worth noting …). (error, text pattern)
- [ai-style/dramatic-fragment](https://slopsift.dev/rules/dramatic-fragment/): A short transition is isolated as a sentence to manufacture drama. (info, document context)
- [ai-style/implementation-detail-pileup](https://slopsift.dev/rules/implementation-detail-pileup/): A passage piles up identifiers, qualifications, and exceptions before establishing the normal behavior. (warn, document context)
- [ai-style/modal-redundancy](https://slopsift.dev/rules/modal-redundancy/): Repeats modality after two possibilities already establish the outcome. (warn, dependency graph)
- [ai-style/outline-conclusion](https://slopsift.dev/rules/outline-conclusion/): A canned “challenges and future prospects” ending instead of a specific conclusion. (info, document context)
- [ai-style/premature-closure](https://slopsift.dev/rules/premature-closure/): A summary aside announces that an explanation is complete even though the paragraph immediately continues. (warn, dependency graph)
- [ai-style/rhetorical-scaffolding](https://slopsift.dev/rules/rhetorical-scaffolding/): Announces, dramatizes, or reassures around a point instead of stating it. (warn, dependency graph)
- [ai-style/semantic-redundancy](https://slopsift.dev/rules/semantic-redundancy/): A nearby sentence or paragraph repeats the same argument without adding concrete support. (info, document context)
- [ai-style/throat-clearing](https://slopsift.dev/rules/throat-clearing/): “it is important to note that …”. If it matters, just say it. (warn, dependency graph)
- [ai-style/ai-vocabulary](https://slopsift.dev/rules/ai-vocabulary/): Words LLMs over-use relative to human writers. (info, text pattern)
- [ai-style/emerging-slop-phrases](https://slopsift.dev/rules/emerging-slop-phrases/): Newly common AI-writing phrases, graded as weak evidence in isolation. (info, text pattern)
- [ai-style/agentless-opener](https://slopsift.dev/rules/agentless-opener/): Telegraphic verbless opener spliced with an “and it …” clause, the doer never appears. (warn, dependency graph)
- [ai-style/agentless-rationale](https://slopsift.dev/rules/agentless-rationale/): Subjectless verb-led explanations accumulate into implementation-trace cadence instead of ordinary reader-facing prose. (warn, dependency graph)
- [ai-style/false-agency](https://slopsift.dev/rules/false-agency/): An abstraction is made to act like a person instead of naming the actor. (warn, dependency graph)
- [ai-style/passive-actor-hiding](https://slopsift.dev/rules/passive-actor-hiding/): A passive clause hides who performed the action. (warn, dependency graph)
- [ai-style/passive-voice-density](https://slopsift.dev/rules/passive-voice-density/): Several nearby sentences rely on passive voice, making the process harder to follow. (warn, document context)
- [ai-style/hedging-seesaw](https://slopsift.dev/rules/hedging-seesaw/): Relentless “While X… However, Y” balancing, a position never taken. (info, document context)
- [ai-style/filler-intensifiers](https://slopsift.dev/rules/filler-intensifiers/): Sincerity adverbs (genuinely, truly, really) doing the believing for the reader. (warn, dependency graph)
- [ai-style/performed-candor](https://slopsift.dev/rules/performed-candor/): Announcing your own honesty (“to be transparent”, “I’ll be honest”) instead of enacting it. (warn, text pattern)
- [ai-style/performed-revelation](https://slopsift.dev/rules/performed-revelation/): Repeated questions, metaphors, and compressed payoffs make an explanation sound like prepared revelations. (warn, document context)
- [ai-style/setup-fragment](https://slopsift.dev/rules/setup-fragment/): A noun-rooted fragment (“One thing I wanted to …”) that stages a point instead of making it. (warn, dependency graph)
- [ai-style/rule-of-three](https://slopsift.dev/rules/rule-of-three/): Reflexive triads of modifiers or balanced independent clauses. (info, dependency graph)
- [ai-style/opening-conjunction](https://slopsift.dev/rules/opening-conjunction/): Formulaic sentence-opening transitions. Often removable. (info, text pattern)
- [ai-style/stepwise-sequencing](https://slopsift.dev/rules/stepwise-sequencing/): Formulaic “X then Y” sequencing where “then” narrates an explanation rather than a real order. (info, dependency graph)
- [ai-style/em-dash-overuse](https://slopsift.dev/rules/em-dash-overuse/): Locally clustered or globally habitual em-dash use. (info, document context)
- [ai-style/emoji](https://slopsift.dev/rules/emoji/): Decorative emoji in formal prose. (info, text pattern)
- [ai-style/generation-artifacts](https://slopsift.dev/rules/generation-artifacts/): Leftover chatbot citation artifacts (oaicite, turn0search0, …). (error, text pattern)
- [ai-style/mixed-quotes](https://slopsift.dev/rules/mixed-quotes/): Straight and curly double quotes mixed in one document, a paste seam. (warn, document context)
- [ai-style/comma-splice](https://slopsift.dev/rules/comma-splice/): Two independent clauses joined only by a comma; clipped cases can perform breeziness. (info, dependency graph)
- [ai-style/headline-fragment](https://slopsift.dev/rules/headline-fragment/): An explanatory passage opens with a noun-heavy headline fragment instead of a complete statement. (info, document context)
- [ai-style/referential-compression](https://slopsift.dev/rules/referential-compression/): Several nearby sentences open with bare pronouns instead of carrying the subject forward explicitly. (info, dependency graph)
- [ai-style/repeated-sentence-frame](https://slopsift.dev/rules/repeated-sentence-frame/): Several nearby sentences repeat the same dependency frame and cadence. (info, dependency graph)
- [ai-style/uniform-rhythm](https://slopsift.dev/rules/uniform-rhythm/): Sentence lengths cluster tightly enough to produce a machine-like drone. (info, document context)
- [reader-first/paragraph-load](https://slopsift.dev/rules/paragraph-load/): A long paragraph hides changes of subject or purpose inside one block. (warn, document context)
- [reader-first/sentence-load](https://slopsift.dev/rules/sentence-load/): A sentence combines enough length, clauses, and technical labels to overload the main point. (warn, document context)
- [reader-first/noun-pile](https://slopsift.dev/rules/noun-pile/): Four or more common nouns are stacked together without showing how they relate. (warn, dependency graph)
- [reader-first/unexplained-initialism](https://slopsift.dev/rules/unexplained-initialism/): A repeated initialism appears without a plain-language introduction. (warn, document context)

## References

- [Documentation](https://slopsift.dev/docs/)
- [GitHub Actions guide](https://slopsift.dev/docs/github-actions/)
- [Rule catalogue JSON](https://slopsift.dev/rules/index.json)
- [Source code](https://github.com/NikhilVerma/writinglint)
- [Privacy](https://slopsift.dev/privacy/)
