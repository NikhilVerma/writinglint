# Sequential cognitive load

## Problem

SlopSift is good at finding local prose problems in a sentence or paragraph. A document can pass those checks and still be exhausting to understand. Local repairs can make every sentence grammatical and every paragraph tidy without fixing the document's underlying thought process.

The missing question is not simply whether the prose is difficult. It is what the reader must keep active while moving from the beginning of the document to the end.

A reader encounters text sequentially. Each sentence adds people, objects, concepts, claims, actions, conditions, exceptions, and relationships to an evolving mental model. Some later sentences reinforce or resolve that state. Others replace it, contradict it, resume it after a long absence, or add more state before the earlier material has become stable. Cognitive overload occurs when the document fills this working set faster than its organization lets the reader integrate or release it.

The goal is to detect avoidable load created by presentation. SlopSift cannot infer the intrinsic difficulty of the subject or know everything a particular audience already understands.

## The graph in the reader's head

Entities and concepts are nodes. Actions, relationships, conditions, distinctions, dependencies, and state changes are edges. Reading order controls how quickly this graph grows and changes.

Counting nodes is insufficient. A paragraph involving only Priya, Omar, and Lena can still be overwhelming if it rapidly describes Priya walking to Omar, Omar talking to Lena, Lena acting on Priya, Priya talking to Omar, and the participants repeatedly exchanging roles. Every clause is locally simple. The burden comes from relationship density and churn.

Conversely, a long document can contain many entities without overloading the reader when it introduces them gradually, uses them immediately, groups them into stable ideas, and reorients the reader when an earlier thread returns.

The relevant unit is therefore the proposition, approximately:

```text
subject -> action or relationship -> object
           + conditions
           + time or sequence
           + state change
```

## The leaky-buffer model

Treat working memory as a bucket with a hole rather than a permanent vocabulary counter. The model does not claim a universal numerical capacity. It records the shape of the load curve and looks for passages where load rises quickly, remains high, or changes faster than the reader can consolidate it.

State enters the buffer when the text introduces:

- a new entity or concept;
- a new proposition or relationship;
- a changed relationship between familiar entities;
- a distinction, condition, exception, or prerequisite;
- an unresolved question, promise, or forward dependency;
- a reference that requires reconstructing earlier context.

State becomes more expensive when:

- familiar entities acquire many relationships in a short passage;
- the same entities repeatedly exchange subject and object roles;
- similar entities participate in similar actions and become easy to confuse;
- a relationship is modified, reversed, contradicted, or qualified;
- the document abandons one thread, develops another, and later resumes the first without reorientation;
- pronouns or abstract labels obscure which nodes and edges are being updated;
- the next claim depends on combining several earlier claims.

State becomes cheaper when the text:

- repeats and stabilizes an existing relationship;
- gives a concrete example immediately after an abstraction;
- explains cause and consequence;
- groups several details beneath one useful idea;
- completes a sequence or resolves an open question;
- summarizes what the reader should retain;
- crosses a meaningful section boundary;
- explicitly reintroduces a dormant thread.

Good organization lets the reader forget. A section should compress its internal detail into a small stable handoff for the next section.

## Lessons from Cognitive Load Is What Matters

Artem Zakirullin's [Cognitive Load Is What Matters](https://github.com/zakirullin/cognitive-load) discusses software, but several mechanisms transfer directly to prose.

Meaningful intermediate names compress several conditions into one reusable chunk. In prose, a good synthesis does the same: it turns several established details into one stable idea. A label only helps when the preceding text has earned and defined that compression; unexplained terminology adds another mapping instead.

Early returns release preconditions from working memory. Prose needs equivalent release points: resolve the question, state the conclusion, close the exception, and then continue along the main line. A document that keeps qualifications active indefinitely behaves like deeply nested control flow.

Deep modules hide substantial internal complexity behind a small interface. A good section should similarly contain detail and hand a compact conclusion to the next section. Many tiny sections can behave like shallow modules when understanding any one of them requires reconstructing their interactions.

Indirection is not information hiding. Cross-references, deferred definitions, repeated "see" instructions, and abstract labels can make the reader jump around the document while retaining the original question. Each unresolved jump occupies the buffer.

Familiarity is not simplicity. Authors who already possess the document's mental model are poor judges of how much a new reader must reconstruct. Calibration must therefore include first-read traces and cannot rely only on author review.

## Dimensions to trace

A reusable `ReadingTrace` should scan reading units in source order and expose inspectable evidence for rules. It should eventually record:

- entity and concept introductions;
- propositions and their subject, predicate, and object;
- new and repeated relationships;
- active entities and active relationships;
- relationship churn and participant role reversals;
- unresolved dependencies and their age;
- topic continuity and abrupt transitions;
- dormant-thread reactivation distance;
- consolidation and release cues;
- indirection and cross-reference jumps;
- local peaks and sustained periods of load.

## Decision debt and operational grounding

A document can reduce surface density and still remain difficult because each clean sentence quietly depends on a judgment the reader cannot execute. Words such as "relevant", "material", or "sufficient" are not inherently bad. They become open state when a rule uses them to accept, reject, rank, or generate something without first supplying an observable criterion. The reader must retain the question "what counts as this?" while continuing through the procedure.

This differs from ordinary terminology debt. A noun may lack a glossary definition yet remain understandable from use. An undefined decision standard changes product behaviour while concealing the branch condition. Several such standards create a stack of unresolved decisions even when the entity count is low.

The deterministic model uses grammar before vocabulary. It finds normative clauses through dependency structure: a predicate governed by a deontic modal, or an imperative predicate with no grammatical subject. It then records evaluative adjective or adverb modifiers inside that clause. A later operational definition pops the standard. The vocabulary layer identifies general scalar judgments; it does not contain customer names, product objects, workflow stages, or phrases copied from a reviewed document.

Some review failures need context that prose alone does not contain. Whether a specification maps to the real product requires a supplied product ontology or interface model. Whether a requirement is an artifact of one customer requires provenance. Whether two distant rules contradict each other requires semantic comparison of their subjects, predicates, conditions, and cardinalities. These should become explicit inputs or separately calibrated semantic signals rather than brittle word lists pretending to know the product.

Procedures create a second kind of open state: each step should consume or transform something made available by an earlier step. The first deterministic handoff signal uses dependency roles rather than step names. It extracts the result complement of a numbered instruction, follows that concept into the next step, and detects an A-B-A detour when the middle step drops the output and the following step resumes it. This is intentionally an `info` review signal because some valid procedures interleave independent work.

The trace is evidence, not a universal cognitive-load score. Rules should report concrete passages and facts such as the number of introduced concepts, relationship changes, role reversals, or unresolved threads. A writer must be able to inspect why the passage was flagged.

## Structure and genre

The same surface count can mean different things in different documents.

- A glossary is lookup material. It can introduce many terms without expecting sequential retention.
- A reference specification may intentionally enumerate a complete vocabulary.
- A tutorial promises sequential understanding and should introduce ideas near their first use.
- A narrative can accumulate many characters across a book while pacing introductions and repeatedly grounding their roles.
- A policy may contain unavoidable distinctions but can still group them, name their hierarchy, and separate normative rules from explanation.

Headings, lists, tables, quotations, examples, and document modes must therefore affect the trace. A heading can release context, but a decorative heading does not automatically repair an incoherent transition. A list item is a separate reading unit even when Markdown blank-line parsing places the complete list inside one paragraph. Tables and glossaries need reference-mode treatment rather than blanket exemption from all analysis.

## Candidate rule families

The trace should support several narrow findings rather than one opaque score:

- `concept-introduction-burst`: recurring concepts are introduced faster than the passage uses or grounds them.
- `relationship-pileup`: a short passage adds many propositions among a small set of participants without grouping or consolidation.
- `role-churn`: the same participants repeatedly exchange grammatical or semantic roles in ways that are difficult to track.
- `definition-cascade`: several definitions accumulate before the document uses the defined concepts.
- `unresolved-concept-stack`: introduced concepts remain necessary but ungrounded while more concepts arrive.
- `topic-whiplash`: the document repeatedly switches between active subjects without completing or bridging them.
- `thread-reactivation`: a dormant subject returns after substantial intervening material without reorientation.
- `prerequisite-inversion`: a passage depends on a concept for too long before explaining it.
- `relationship-debt`: entities are described individually while the relationships needed to understand the system remain implicit.
- `flat-importance`: many claims receive equal emphasis and the document provides no hierarchy for what the reader should retain.
- `undefined-decision-stack`: several normative clauses depend on evaluative standards that have not been operationally defined.
- `procedure-thread-detour`: a numbered process drops a prior step's output for one step and then resumes it.

These names are working descriptions, not a commitment that every signal deserves a public rule.

## Evidence and implementation boundary

The dependency parse already gives WritingLint sentence boundaries, parts of speech, dependency relationships, and document-global source ranges. The first implementation should derive propositions from finite clause roots and their subject and object dependents. It should preserve uncertainty when a subject is implicit, coordinated, inherited, or unresolved.

The initial implementation should remain deterministic and inspectable. Semantic similarity, coreference resolution, embeddings, or a learned model may later improve concept identity and topic continuity, but those signals must expose assumptions and should begin as non-blocking review findings.

The current `concept-introduction-burst` implementation is a probe. Its recurring-noun heuristic and thresholds are not validated as a finished rule. It must become one feature of the sequential trace and be evaluated across unrelated documents before release.

## Calibration corpus

One private company document in ignored local evaluation data supplied the initial adversarial example. It is private calibration data, not a public fixture, not a blind held-out set once it influences development, and must never be committed, published, copied into synthetic examples, or transferred to external systems.

No detector or threshold may be chosen because it catches that document alone. Calibration needs unrelated examples across:

- dense and clear technical specifications;
- technical tutorials for new readers;
- policies and legal explanations;
- glossaries and lookup-oriented reference material;
- narrative prose with few and many characters;
- essays that maintain or deliberately revisit an argument;
- synthetic documents containing identical facts in different orders and pacing.

Clear writing from authors such as Ernest Hemingway and Paul Graham can provide contrastive reading traces, subject to copyright and permitted-use boundaries. Public prose used for local evaluation should not be copied into committed fixtures unless its licence clearly permits that use. Public tests should use original synthetic pairs that isolate one structural difference.

Important comparisons keep content constant:

- the same concepts introduced together or near first use;
- the same participants and events packed into one paragraph or grouped into stages;
- the same argument in a coherent order or shuffled between threads;
- the same relationship graph with and without summaries and reorientation;
- the same total complexity with different peak and sustained load.

Evaluation must include legitimate cases that should not fire. Counts alone are not validation. Human review should ask whether a finding identifies the point where a new reader first loses the thread and whether its explanation suggests a useful structural repair.

## Implementation plan

1. Add a parser-backed `ReadingTrace` that emits reading units and clause-level propositions with exact source ranges.
2. Cover direct subjects, objects, oblique relationships, coordinated clauses, and missing participants with focused synthetic tests.
3. Add sequential activation state with explicit events for introduction, reinforcement, role change, reactivation, and structural release.
4. Rebuild concept-introduction pace on the trace instead of a standalone document noun count.
5. Implement `relationship-pileup` as the first edge-aware rule using matched dense and paced examples.
6. Assemble a local, uncommitted calibration manifest spanning genres and purposes; record provenance and expected role without copying restricted prose into the repository.
7. Measure every candidate rule against difficult and legitimate contrasts, adjust confidence before severity, and keep uncertain signals at `info`.
8. Add section hierarchy and document-mode support where current extractor regions are insufficient.
9. Explore coreference and semantic concept identity only after deterministic proposition traces are useful on their own.

## Success criteria

The work succeeds when SlopSift can distinguish documents with the same vocabulary and facts but materially different introduction pace, relationship density, ordering, and release structure. Findings must identify the overloaded span and the state transition that caused it. The system must not merely reproduce a judgment that the source document is long, technical, or unpleasant.
