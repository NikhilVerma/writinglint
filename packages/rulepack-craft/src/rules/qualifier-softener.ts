/**
 * Qualifier softener — an intensity dimmer on an evaluative adjective: "pretty
 * good", "quite nice". Structural: the softener must actually modify the
 * adjective (advmod), so "pretty flowers" (amod ADJ, not a softener) never fires.
 */
import { childrenOf, defineRule, lower, type DepSentence, type DepToken } from "writinglint-core";

const SOFTENERS = new Set([
    "pretty",
    "quite",
    "fairly",
    "somewhat",
    "rather",
    "relatively",
    "reasonably"
]);

export const qualifierSoftener = defineRule({
    meta: {
        name: "qualifier-softener",
        category: "hedging",
        docs: { description: "“pretty good” — a dimmer switch on your own claim. Commit or cut." },
        defaultSeverity: "warn"
    },
    create(ctx) {
        return {
            Sentence(sentence) {
                const s: DepSentence = sentence.dep;
                for (const adj of s.tokens) {
                    if (adj.upos !== "ADJ") continue;
                    const soft = childrenOf(s, adj.id).find(
                        (c: DepToken) => c.deprel === "advmod" && SOFTENERS.has(lower(c))
                    );
                    if (!soft) continue;
                    ctx.report({
                        tokens: [soft, adj],
                        sentence: s,
                        message: `“${soft.form} ${adj.form}” — a dimmer switch on your own claim. Either you mean “${adj.form}” (say it) or you don't (find the word you do mean).`
                    });
                }
            }
        };
    }
});
