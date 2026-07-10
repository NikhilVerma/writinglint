/**
 * Verdict echo — the same evaluative word twice in close range: "better parsers
 * to build better guardrails", "pretty good … but it's good". One of the two is
 * doing no work. "Close range" is the same sentence, or anywhere in a
 * tweet-length document — short pieces have no room to spend a word twice.
 */
import { defineRule, type Tok } from "writinglint-core";

const EVALUATIVE = new Set([
    "good",
    "better",
    "best",
    "great",
    "nice",
    "bad",
    "worse",
    "important",
    "interesting",
    "powerful",
    "amazing",
    "useful",
    "solid"
]);

/** Under this many words, a repeat anywhere in the doc is a repeat "in the same breath". */
const SHORT_DOC_WORDS = 80;

export const verdictEcho = defineRule({
    meta: {
        name: "verdict-echo",
        category: "evidence",
        docs: {
            description:
                "The same evaluative word twice in close range (“better X to build better Y”). One is doing no work — cut one."
        },
        defaultSeverity: "error"
    },
    create(ctx) {
        return {
            Document(doc) {
                const docIsShort = doc.tokens.length <= SHORT_DOC_WORDS;
                const seen = new Map<string, Tok>(); // word → first occurrence
                for (const tok of doc.tokens) {
                    if (!EVALUATIVE.has(tok.lower)) continue;
                    const first = seen.get(tok.lower);
                    if (!first) {
                        seen.set(tok.lower, tok);
                        continue;
                    }
                    if (docIsShort || first.sentence === tok.sentence) {
                        ctx.report({
                            span: { start: tok.start, end: tok.end },
                            message: `“${tok.text}” again — you already spent it. One of the two is doing no work; cut one, or replace this one with the concrete thing you actually saw.`
                        });
                    }
                }
            }
        };
    }
});
