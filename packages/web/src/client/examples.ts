/**
 * Two pitches for WritingLint that say the *same thing* — one written the way an
 * LLM writes, one edited by a human. The demo loads the AI one first: watch the
 * linter light it up, then switch to the human version and watch the flags fall away.
 * These strings are the source of truth for the matching copy on the landing page.
 */

export const AI_PITCH = `In today's fast-moving landscape, WritingLint stands as a testament to a simple idea: that prose deserves the same rigor we give code. It's not just a linter, it's a paradigm shift in how we think about writing. Leveraging the rich tapestry of dependency-graph analysis, WritingLint delves into the intricate, nuanced, and multifaceted structure of every sentence.

Studies suggest that structural tells are far more robust than surface patterns. Moreover, WritingLint boasts a diverse array of authorable rules, nestled at the intersection of linguistics and developer tooling. It's important to note that this is only the beginning.

Ultimately, WritingLint empowers writers to craft clearer, sharper, and more compelling prose — underscoring the importance of substance over spectacle. Trust the graph, not the vibes.

One thing we wanted to put on the table before you scroll further. To be fully transparent, we are genuinely excited about where this is heading. Benchmarks attached, and they are a fuller picture than the docs. Try the live demo, the flags appear instantly. It runs locally, nothing leaves your browser. Thanks for reading, we enjoyed every draft.`;

export const HUMAN_PITCH = `WritingLint is a grammar linter for prose. Its rules match over a dependency parse of each sentence, not just a flat list of words or part-of-speech tags. That lets a rule target the real structure of a phrase — say, a coordinated "X, not Y" contrast — which regex and POS patterns tend to miss.

The trade-off is speed. The parser is a real model that runs on-device, so it is slower than a pattern matcher. In exchange, you can write richer rules, and they keep working when someone rewords the sentence.

The AI-writing rulepack is one example of what that buys you: we turned the common tells of AI prose into rules. You can consume WritingLint as a library, run it from the command line, or write and ship your own rules. I've attached the benchmarks; they give a fuller picture than this page. Try the live demo — it runs locally, so nothing leaves your browser. Thanks for reading.`;

/**
 * The same idea, for the craft pack: one draft written by a writer who
 * doesn't quite believe they're allowed to say the thing, one that commits.
 * The argument is identical — only the posture changes.
 */

export const HEDGED_PITCH = `Sorry in advance if this is obvious. It might seem counterintuitive, but I think we need deterministic NLP tools more than ever. LLMs are pretty good at parsing regulatory documents, but their behaviour changes between runs (not that important, but it bothers me). The same document can pass one run and fail the next, which is unacceptable for compliance work.

It might sound old-fashioned, but a better parser could be a better guardrail than another prompt. A deterministic parser handles malformed input properly and gives you a robust foundation to build on. The team made a decision to carry out an assessment of the compliance document review workflow before committing. This could be quite useful for compliance teams, I guess.`;

export const COMMITTED_PITCH = `We need deterministic NLP tools more than ever. MoE architectures and batching give LLMs run-to-run variance: the same regulatory document can pass one run and fail the next. An auditor cannot sign off on a coin flip.

A deterministic dependency parser produces the same graph for the same sentence, every time. It will not write poetry, and it is slower than a regex. In exchange, the one thing a compliance pipeline needs — the same answer twice — is the one thing it guarantees. We assessed how compliance teams review documents before we committed to this design. Build the guardrail out of the boring tool.`;
