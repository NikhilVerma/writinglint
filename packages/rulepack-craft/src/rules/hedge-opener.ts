/**
 * Hedge opener — expletive it/this + modal + seem/sound/appear: "It might seem
 * counterintuitive, but …". The claim is being apologised for before it's made.
 * Structural, so ANY hedged claim fits the slots ("This could sound naive …");
 * plain reported perception ("It seemed late") lacks the modal and never fires.
 */
import { childrenOf, defineRule, lower, type DepSentence } from "writinglint-core";

const HEDGE_VERB = new Set([
    "seem",
    "seems",
    "seemed",
    "sound",
    "sounds",
    "sounded",
    "appear",
    "appears",
    "appeared"
]);
const HEDGE_MODAL = new Set(["might", "may", "could"]);

export const hedgeOpener = defineRule({
    meta: {
        name: "hedge-opener",
        category: "hedging",
        docs: {
            description:
                "“It might seem X, but …” — the reveal is buried behind an apology for it. Delete the setup; lead with the claim."
        },
        defaultSeverity: "error"
    },
    create(ctx) {
        return {
            Sentence(sentence) {
                const s: DepSentence = sentence.dep;
                for (const verb of s.tokens) {
                    if (!HEDGE_VERB.has(lower(verb))) continue;
                    const modal = childrenOf(s, verb.id).find(
                        (c) => c.deprel === "aux" && HEDGE_MODAL.has(lower(c))
                    );
                    if (!modal) continue;
                    const subj = childrenOf(s, verb.id).find(
                        (c) =>
                            (c.deprel === "nsubj" || c.deprel === "expl") &&
                            (lower(c) === "it" || lower(c) === "this")
                    );
                    if (!subj) continue;
                    ctx.report({
                        tokens: [subj, modal, verb],
                        sentence: s,
                        message:
                            "Hedge opener (“it might seem …”): apologising for the claim before making it. Delete the setup — lead with the claim and trust it to be surprising on its own."
                    });
                }
            }
        };
    }
});
