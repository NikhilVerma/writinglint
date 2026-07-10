/**
 * Parenthetical hedge — a parenthesis that undercuts its own sentence: "give a
 * slightly different prompt (not that important)". If the aside is true it
 * earns a clause of its own; if it isn't, it dies. Lexical by nature: the
 * parenthesis is punctuation, and the hedge markers are a closed set.
 */
import { defineRule } from "writinglint-core";

const PAREN_HEDGE =
    /\([^)]*\b(?:not that|maybe|probably|i think|sort of|kind of|not sure|more or less|i guess)\b[^)]*\)/gi;

export const parentheticalHedge = defineRule({
    meta: {
        name: "parenthetical-hedge",
        category: "hedging",
        docs: {
            description:
                "A self-undercutting parenthetical (“(not that important)”). Either it earns a clause of its own or it dies."
        },
        defaultSeverity: "error"
    },
    create(ctx) {
        return {
            Sentence(sentence) {
                for (const m of sentence.text.matchAll(PAREN_HEDGE)) {
                    const start = sentence.start + (m.index ?? 0);
                    ctx.report({
                        span: { start, end: start + m[0].length },
                        message:
                            "Self-undercutting parenthetical. If the aside matters, give it a sentence and say why; if it doesn’t, cut it."
                    });
                }
            }
        };
    }
});
