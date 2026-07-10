/**
 * Hedge phrase — bare hedges dropped into a claim: "I think we need …",
 * "honestly", "sort of broken". The reader knows it's your opinion; the byline
 * said so. Bigram-aware where a word is only a hedge in context: "sort of" /
 * "kind of" hedge an adjective or verb ("sort of broken") but are literal
 * before a noun ("a kind of parser"); "maybe"-class words are flagged only
 * sentence-initial, where they soften the whole claim rather than one term.
 */
import { defineRule, type Tok } from "writinglint-core";

/** Multiword hedges, matched on consecutive word tokens. Always a hedge. */
const PHRASES: string[][] = [
    ["i", "think"],
    ["i", "guess"],
    ["i", "feel", "like"],
    ["in", "my", "opinion"],
    ["to", "be", "honest"]
];

/** Single words that always hedge. */
const ALWAYS = new Set(["honestly", "arguably", "imo", "imho"]);

/** Hedges only when they open the sentence — mid-sentence they can be real epistemics. */
const SENTENCE_INITIAL = new Set(["maybe", "perhaps", "probably"]);

/** "sort of" / "kind of" hedge what follows only if it's an ADJ or VERB. */
const SORT_KIND = new Set(["sort", "kind"]);

export const hedgePhrase = defineRule({
    meta: {
        name: "hedge-phrase",
        category: "hedging",
        docs: {
            description:
                "“I think”, “honestly”, “sort of” — the byline already says it's your opinion. State the claim."
        },
        defaultSeverity: "warn"
    },
    create(ctx) {
        const flag = (words: Tok[], message: string) =>
            ctx.report({
                span: { start: words[0].start, end: words[words.length - 1].end },
                message
            });

        return {
            Sentence(sentence) {
                const w = sentence.words;
                for (let i = 0; i < w.length; i++) {
                    const tok = w[i];

                    if (ALWAYS.has(tok.lower)) {
                        flag(
                            [tok],
                            `“${tok.text}” hedges the claim without adding information. Cut it and let the sentence commit.`
                        );
                        continue;
                    }

                    if (i === 0 && SENTENCE_INITIAL.has(tok.lower)) {
                        flag(
                            [tok],
                            `Opening with “${tok.text}” softens everything after it. If you're unsure, say what would settle it; if you're sure, delete the word.`
                        );
                        continue;
                    }

                    for (const phrase of PHRASES) {
                        if (i + phrase.length > w.length) continue;
                        if (phrase.every((p, j) => w[i + j].lower === p)) {
                            flag(
                                w.slice(i, i + phrase.length),
                                `“${phrase.join(" ")}” — the byline already says it's your opinion. State the claim.`
                            );
                            break;
                        }
                    }

                    if (SORT_KIND.has(tok.lower) && w[i + 1]?.lower === "of") {
                        const next = w[i + 2];
                        if (next && (next.upos === "ADJ" || next.upos === "VERB")) {
                            flag(
                                [tok, w[i + 1]],
                                `“${tok.text} of ${next.text}” — either it is ${next.text} or it isn't. Commit or find the accurate word.`
                            );
                        }
                    }
                }
            }
        };
    }
});
