/**
 * Apology reflex — apologising in a draft nobody has objected to yet: "sorry
 * for the long post", "apologies in advance". The flinch, in print — bracing
 * to be wrong before anyone said you were.
 */
import { defineRule } from "writinglint-core";

const APOLOGY = new Set(["sorry", "apologies", "apologise", "apologize"]);

export const apologyReflex = defineRule({
    meta: {
        name: "apology-reflex",
        category: "posture",
        docs: {
            description:
                "Apologising to a reader who hasn’t objected. The flinch, in print. Delete."
        },
        defaultSeverity: "error"
    },
    create(ctx) {
        return {
            Token(tok) {
                if (!APOLOGY.has(tok.lower)) return;
                ctx.report({
                    span: { start: tok.start, end: tok.end },
                    message:
                        "Apologising to a reader who hasn’t objected — bracing to be wrong before anyone said you were. Nothing to apologise for yet. Delete."
                });
            }
        };
    }
});
