/**
 * Stacked noun phrases — "the customer onboarding flow migration project
 * timeline". Each noun modifying the next is fine once ("deployment process");
 * piled three or four deep the reader must unpack the grammar themselves.
 * Corporate register at its densest, and a chronic LLM habit too.
 *
 * Graph shape: a head noun whose transitive `compound` closure holds three or
 * more modifiers. Guards: members must be lowercase alphabetic words (proper
 * names like "New York City Hall" and junk parses of headings or foreign text
 * stay exempt) and the sentence must contain a finite verb — noun piles in
 * captions and titles are labels, not prose.
 */
import { childrenOf, defineRule, type DepSentence, type DepToken } from "writinglint-core";

const MIN_COMPOUNDS = 3;
const WORD_RE = /^[a-z][a-z-]*$/;

export const stackedNouns = defineRule({
    meta: {
        name: "stacked-nouns",
        category: "register",
        docs: { description: "Three or more nouns piled before a head noun — unpack with a verb or preposition." }
    },
    create(ctx) {
        return {
            Sentence(sentence) {
                const s: DepSentence = sentence.dep;
                if (!s.tokens.some((t) => t.upos === "VERB" || t.upos === "AUX")) return;
                for (const head of s.tokens) {
                    if (head.upos !== "NOUN" || !WORD_RE.test(head.form)) continue;
                    const members: DepToken[] = [];
                    const stack = [head.id];
                    let clean = true;
                    while (stack.length) {
                        const id = stack.pop()!;
                        for (const c of childrenOf(s, id)) {
                            if (!c.deprel.startsWith("compound")) continue;
                            if (!WORD_RE.test(c.form)) { clean = false; break; }
                            members.push(c);
                            stack.push(c.id);
                        }
                        if (!clean) break;
                    }
                    if (!clean || members.length < MIN_COMPOUNDS) continue;
                    const pile = [...members, head].sort((a, b) => a.id - b.id);
                    ctx.report({
                        tokens: pile,
                        sentence: s,
                        message:
                            `Noun pile: ${pile.length} nouns stacked before “${head.form}” make the reader unpack the ` +
                            "grammar themselves. Break it up with a verb or preposition — whose what does what?"
                    });
                }
            }
        };
    }
});
