/**
 * Two pitches for Better Write that say the *same thing* — one written the way an
 * LLM writes, one edited by a human. The demo loads the AI one first: watch the
 * linter light it up, then switch to the human version and watch the flags fall away.
 * These strings are the source of truth for the matching copy on the landing page.
 */

export const AI_PITCH = `In today's fast-moving landscape, Better Write stands as a testament to a simple idea: that prose deserves the same rigor we give code. It's not just a linter, it's a paradigm shift in how we think about writing. Leveraging the rich tapestry of dependency-graph analysis, Better Write delves into the intricate, nuanced, and multifaceted structure of every sentence.

Studies suggest that structural tells are far more robust than surface patterns. Moreover, Better Write boasts a diverse array of authorable rules, nestled at the intersection of linguistics and developer tooling. It's important to note that this is only the beginning.

Ultimately, Better Write empowers writers to craft clearer, sharper, and more compelling prose — underscoring the importance of substance over spectacle. Trust the graph, not the vibes.`;

export const HUMAN_PITCH = `Better Write is a grammar linter for prose. Its rules match over a dependency parse of each sentence, not just a flat list of words or part-of-speech tags. That lets a rule target the real structure of a phrase — say, a coordinated "X, not Y" contrast — which regex and POS patterns tend to miss.

The trade-off is speed. The parser is a real model that runs on-device, so it is slower than a pattern matcher. In exchange, you can write richer rules, and they keep working when someone rewords the sentence.

The AI-writing rulepack is one example of what that buys you: we turned the common tells of AI prose into rules. You can consume Better Write as a library, run it from the command line, or write and ship your own rules.`;
