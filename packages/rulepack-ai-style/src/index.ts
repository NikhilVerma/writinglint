/**
 * writinglint-rulepack-ai-style — the AI-writing-style rulepack.
 *
 * Eighteen authorable rules (structural, matched on the dependency graph; and
 * lexical, matched on words/characters) plus a separate document-level SCORE.
 * The pack plugs into writinglint-core like any other; `recommended` is the
 * batteries-included config a consumer can lint with directly or `extends`.
 */
import { definePack, defineConfig, type Config, type RuleSetting } from 'writinglint-core';
import { CATEGORIES } from './categories.js';

// structural (dependency-graph) rules
import { ruleOfThree } from './rules/rule-of-three.js';
import { negativeParallelism } from './rules/negative-parallelism.js';
import { correctiveAntithesis } from './rules/corrective-antithesis.js';
import { participialAppendage } from './rules/participial-appendage.js';
import { copulaAvoidance } from './rules/copula-avoidance.js';
import { lightVerbRole } from './rules/light-verb-role.js';
import { vagueAttribution } from './rules/vague-attribution.js';
import { throatClearing } from './rules/throat-clearing.js';
// document-level discourse rules
import { hedgingSeesaw } from './rules/hedging-seesaw.js';
// lexical rules
import { significanceIdioms, promoIdioms, chatbotIdioms } from './rules/idioms.js';
import { aiVocabulary } from './rules/ai-vocabulary.js';
import { openingConjunction } from './rules/opening-conjunction.js';
import { emDashOveruse, mixedQuotes, generationArtifacts, emoji } from './rules/formatting.js';

const rules = {
  'rule-of-three': ruleOfThree,
  'negative-parallelism': negativeParallelism,
  'corrective-antithesis': correctiveAntithesis,
  'participial-appendage': participialAppendage,
  'copula-avoidance': copulaAvoidance,
  'light-verb-role': lightVerbRole,
  'vague-attribution': vagueAttribution,
  'throat-clearing': throatClearing,
  'hedging-seesaw': hedgingSeesaw,
  'significance-idioms': significanceIdioms,
  'promo-idioms': promoIdioms,
  'chatbot-idioms': chatbotIdioms,
  'ai-vocabulary': aiVocabulary,
  'opening-conjunction': openingConjunction,
  'em-dash-overuse': emDashOveruse,
  'mixed-quotes': mixedQuotes,
  'generation-artifacts': generationArtifacts,
  emoji,
};

/** Every rule at 'warn' (the score is severity-independent; flags are advisory). */
const RECOMMENDED_RULES: Record<string, RuleSetting> = Object.fromEntries(
  Object.keys(rules).map((name) => [`ai-style/${name}`, 'warn'] as const),
);

export const aiStyle = definePack({
  name: 'ai-style',
  rules,
  categories: CATEGORIES,
  configs: {
    recommended: { rules: RECOMMENDED_RULES },
    all: { rules: RECOMMENDED_RULES },
  },
});

/**
 * Batteries-included config: registers the pack and enables its recommended
 * rules. Lint with it directly, or `extends: [recommended]` and override.
 */
export const recommended: Config = defineConfig({
  plugins: { 'ai-style': aiStyle },
  extends: [aiStyle.configs!.recommended],
});

export { CATEGORIES, CATEGORY_ORDER, CATEGORY_WEIGHT } from './categories.js';
export { score, verdict, VERDICTS } from './score/index.js';
export type { Model, ScoreResult, DocFeatures } from './score/index.js';
