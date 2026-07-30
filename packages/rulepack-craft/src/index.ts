/**
 * writinglint-rulepack-craft — better-writing rules (formerly "conviction").
 *
 * The ai-style pack catches what MODELS do; this pack helps a writer get
 * better at the craft. Its first family is conviction — what people do when
 * they don't quite believe they're allowed to say the thing: hedge the
 * opener, soften the adjective, undercut the sentence from inside a
 * parenthesis, hand over a verdict with the evidence missing, apologise to a
 * reader who hasn't objected. The second family is music — the science of
 * bad writing distilled into rules, starting with metronome sentence rhythm
 * (Gary Provost: "I vary the sentence length, and I create music"). Every
 * rule here was earned by a real draft.
 */
import { definePack, defineConfig, type Config, type RuleSetting } from "writinglint-core";
import { CATEGORIES } from "./categories.js";
import { apologyReflex } from "./rules/apology-reflex.js";
// structural (dependency-graph) rules
import { hedgeOpener } from "./rules/hedge-opener.js";
// lexical rules
import { hedgePhrase } from "./rules/hedge-phrase.js";
import { parentheticalHedge } from "./rules/parenthetical-hedge.js";
import { qualifierSoftener } from "./rules/qualifier-softener.js";
import { verdictEcho } from "./rules/verdict-echo.js";
import { verdictWord } from "./rules/verdict-word.js";
// corporate-register (dependency-graph) rules
import { stackedNouns } from "./rules/stacked-nouns.js";
import { nominalization } from "./rules/nominalization.js";
// document-level rhythm rules
import { uniformRhythm } from "./rules/uniform-rhythm.js";

const rules = {
    "hedge-opener": hedgeOpener,
    "hedge-phrase": hedgePhrase,
    "verdict-echo": verdictEcho,
    "verdict-word": verdictWord,
    "parenthetical-hedge": parentheticalHedge,
    "qualifier-softener": qualifierSoftener,
    "apology-reflex": apologyReflex,
    "stacked-nouns": stackedNouns,
    nominalization,
    "uniform-rhythm": uniformRhythm
};

/** Every rule at its author-set default severity. */
const RECOMMENDED_RULES: Record<string, RuleSetting> = Object.fromEntries(
    Object.entries(rules).map(
        ([name, rule]) => [`craft/${name}`, rule.meta.defaultSeverity ?? "warn"] as const
    )
);

export const craft = definePack({
    name: "craft",
    rules,
    categories: CATEGORIES,
    configs: {
        recommended: { rules: RECOMMENDED_RULES },
        all: { rules: RECOMMENDED_RULES }
    }
});

/**
 * Batteries-included config: registers the pack and enables its recommended
 * rules. Lint with it directly, or `extends: [recommended]` and override.
 */
export const recommended: Config = defineConfig({
    plugins: { craft },
    extends: [craft.configs!.recommended]
});

export { CATEGORIES, CATEGORY_ORDER } from "./categories.js";
export {
    hedgeOpener,
    hedgePhrase,
    verdictEcho,
    verdictWord,
    parentheticalHedge,
    qualifierSoftener,
    apologyReflex,
    stackedNouns,
    nominalization,
    uniformRhythm
};
