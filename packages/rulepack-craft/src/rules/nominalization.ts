/**
 * Nominalization — a light verb plus a deverbal noun burying the real verb:
 * "made a decision" (decide), "conducted an evaluation" (evaluate). The
 * classic plain-language pair list; the verb form is shorter, stronger, and
 * forces an actor. Zero hits across the human eval corpus, so each match
 * reports on its own.
 *
 * Graph shape: a light verb whose `obj` is a known deverbal noun. The pairing
 * matters — "made a decision" buries a verb, "respected a decision" does not,
 * so a bare noun list would over-fire.
 */
import { child, defineRule, type DepSentence } from "writinglint-core";

const LIGHT = new Set([
    "make", "makes", "made", "making",
    "take", "takes", "took", "taking",
    "conduct", "conducts", "conducted", "conducting",
    "perform", "performs", "performed", "performing",
    "provide", "provides", "provided", "providing",
    "carry", "carries", "carried",
    "undertake", "undertook", "undertaken",
    "reach", "reached",
    "come", "came",
    "give", "gives", "gave", "given"
]);

/** Deverbal noun → the buried verb to suggest. */
const DEVERBAL: Record<string, string> = {
    decision: "decide", decisions: "decide",
    assessment: "assess", assessments: "assess",
    evaluation: "evaluate", evaluations: "evaluate",
    analysis: "analyze", analyses: "analyze",
    recommendation: "recommend", recommendations: "recommend",
    determination: "determine",
    conclusion: "conclude", conclusions: "conclude",
    improvement: "improve", improvements: "improve",
    consideration: "consider",
    investigation: "investigate", investigations: "investigate",
    examination: "examine",
    comparison: "compare", comparisons: "compare",
    implementation: "implement",
    assumption: "assume", assumptions: "assume",
    adjustment: "adjust", adjustments: "adjust",
    contribution: "contribute", contributions: "contribute",
    observation: "observe", observations: "observe",
    description: "describe",
    explanation: "explain"
};

export const nominalization = defineRule({
    meta: {
        name: "nominalization",
        category: "register",
        docs: { description: "A light verb plus a deverbal noun (“made a decision”) burying the real verb (“decided”)." }
    },
    create(ctx) {
        return {
            Sentence(sentence) {
                const s: DepSentence = sentence.dep;
                for (const t of s.tokens) {
                    if (t.upos !== "VERB" || !LIGHT.has(t.form.toLowerCase())) continue;
                    const obj = child(s, t.id, "obj");
                    const verb = obj && DEVERBAL[obj.form.toLowerCase()];
                    if (!obj || !verb) continue;
                    ctx.report({
                        tokens: [t, obj],
                        sentence: s,
                        message:
                            `“${t.form} … ${obj.form}” buries the verb “${verb}” inside a noun. ` +
                            `“${verb}” is shorter, stronger, and forces an actor.`
                    });
                }
            }
        };
    }
});
