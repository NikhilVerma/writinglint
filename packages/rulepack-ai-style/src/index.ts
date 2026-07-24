/**
 * writinglint-rulepack-ai-style — the AI-writing-style rulepack.
 *
 * Eighteen authorable rules (structural, matched on the dependency graph; and
 * lexical, matched on words/characters) plus a separate document-level SCORE.
 * The pack plugs into writinglint-core like any other; `recommended` is the
 * batteries-included config a consumer can lint with directly or `extends`.
 */
import { definePack, defineConfig, type Confidence, type Config, type Rule, type RuleSetting } from 'writinglint-core';
import { CATEGORIES } from './categories.js';

// structural (dependency-graph) rules
import { ruleOfThree } from './rules/rule-of-three.js';
import { negativeParallelism } from './rules/negative-parallelism.js';
import { correctiveAntithesis } from './rules/corrective-antithesis.js';
import { stepwiseSequencing } from './rules/stepwise-sequencing.js';
import { negativeContrast } from './rules/negative-contrast.js';
import { participialAppendage } from './rules/participial-appendage.js';
import { copulaAvoidance } from './rules/copula-avoidance.js';
import { lightVerbRole } from './rules/light-verb-role.js';
import { vagueAttribution } from './rules/vague-attribution.js';
import { throatClearing } from './rules/throat-clearing.js';
import { passiveActorHiding } from './rules/passive-actor-hiding.js';
import { falseAgency } from './rules/false-agency.js';
import { rhetoricalScaffolding } from './rules/rhetorical-scaffolding.js';
import { negativeListBuildup } from './rules/negative-list-buildup.js';
import { modalRedundancy } from './rules/modal-redundancy.js';
// document-level discourse rules
import { hedgingSeesaw } from './rules/hedging-seesaw.js';
import { dramaticFragment } from './rules/dramatic-fragment.js';
// lexical rules
import { significanceIdioms, promoIdioms, chatbotIdioms } from './rules/idioms.js';
import { aiVocabulary } from './rules/ai-vocabulary.js';
import { emergingSlopPhrases } from './rules/emerging-slop-phrases.js';
import { openingConjunction } from './rules/opening-conjunction.js';
import { emDashOveruse, mixedQuotes, generationArtifacts, emoji } from './rules/formatting.js';
import { unsupportedCertainty } from './rules/unsupported-certainty.js';
import { vagueDeclarative } from './rules/vague-declarative.js';
import { outlineConclusion } from './rules/outline-conclusion.js';
import { uniformRhythm } from './rules/uniform-rhythm.js';
import { mechanicalOutline } from './rules/mechanical-outline.js';
import { absoluteClaim } from './rules/absolute-claim.js';
import { vagueQuantifier } from './rules/vague-quantifier.js';
import { semanticRedundancy } from './rules/semantic-redundancy.js';
import { evidenceCluster } from './rules/evidence-cluster.js';
import { unsupportedComparison } from './rules/unsupported-comparison.js';

const rawRules = {
  'rule-of-three': ruleOfThree,
  'negative-parallelism': negativeParallelism,
  'corrective-antithesis': correctiveAntithesis,
  'stepwise-sequencing': stepwiseSequencing,
  'negative-contrast': negativeContrast,
  'participial-appendage': participialAppendage,
  'copula-avoidance': copulaAvoidance,
  'light-verb-role': lightVerbRole,
  'vague-attribution': vagueAttribution,
  'throat-clearing': throatClearing,
  'passive-actor-hiding': passiveActorHiding,
  'false-agency': falseAgency,
  'rhetorical-scaffolding': rhetoricalScaffolding,
  'negative-list-buildup': negativeListBuildup,
  'modal-redundancy': modalRedundancy,
  'hedging-seesaw': hedgingSeesaw,
  'dramatic-fragment': dramaticFragment,
  'significance-idioms': significanceIdioms,
  'promo-idioms': promoIdioms,
  'chatbot-idioms': chatbotIdioms,
  'ai-vocabulary': aiVocabulary,
  'emerging-slop-phrases': emergingSlopPhrases,
  'opening-conjunction': openingConjunction,
  'em-dash-overuse': emDashOveruse,
  'mixed-quotes': mixedQuotes,
  'generation-artifacts': generationArtifacts,
  emoji,
  'unsupported-certainty': unsupportedCertainty,
  'vague-declarative': vagueDeclarative,
  'outline-conclusion': outlineConclusion,
  'uniform-rhythm': uniformRhythm,
  'mechanical-outline': mechanicalOutline,
  'absolute-claim': absoluteClaim,
  'vague-quantifier': vagueQuantifier,
  'semantic-redundancy': semanticRedundancy,
  'unsupported-comparison': unsupportedComparison,
  // Keep last: DocumentExit combines findings emitted by every earlier rule.
  'evidence-cluster': evidenceCluster,
};

export type RuleMethod = 'dependency-graph' | 'document-context' | 'lexical';

/**
 * The primary evidence source used by each rule. This is public metadata for
 * documentation and integrations; it is not inferred from implementation
 * details at build time.
 */
export const RULE_METHODS: Record<keyof typeof rawRules, RuleMethod> = {
  'rule-of-three': 'dependency-graph',
  'negative-parallelism': 'dependency-graph',
  'corrective-antithesis': 'dependency-graph',
  'stepwise-sequencing': 'dependency-graph',
  'negative-contrast': 'dependency-graph',
  'participial-appendage': 'dependency-graph',
  'copula-avoidance': 'dependency-graph',
  'light-verb-role': 'dependency-graph',
  'vague-attribution': 'dependency-graph',
  'throat-clearing': 'dependency-graph',
  'passive-actor-hiding': 'dependency-graph',
  'false-agency': 'dependency-graph',
  'rhetorical-scaffolding': 'dependency-graph',
  'negative-list-buildup': 'dependency-graph',
  'modal-redundancy': 'dependency-graph',
  'hedging-seesaw': 'document-context',
  'dramatic-fragment': 'document-context',
  'significance-idioms': 'lexical',
  'promo-idioms': 'lexical',
  'chatbot-idioms': 'lexical',
  'ai-vocabulary': 'lexical',
  'emerging-slop-phrases': 'lexical',
  'opening-conjunction': 'lexical',
  'em-dash-overuse': 'document-context',
  'mixed-quotes': 'document-context',
  'generation-artifacts': 'lexical',
  emoji: 'lexical',
  'unsupported-certainty': 'document-context',
  'vague-declarative': 'document-context',
  'outline-conclusion': 'document-context',
  'uniform-rhythm': 'document-context',
  'mechanical-outline': 'document-context',
  'absolute-claim': 'document-context',
  'vague-quantifier': 'document-context',
  'semantic-redundancy': 'document-context',
  'unsupported-comparison': 'lexical',
  'evidence-cluster': 'document-context',
};

const CONFIDENCE: Record<keyof typeof rawRules, Confidence> = {
  'rule-of-three': 'low',
  'negative-parallelism': 'medium',
  'corrective-antithesis': 'medium',
  'stepwise-sequencing': 'low',
  'negative-contrast': 'medium',
  'participial-appendage': 'low',
  'copula-avoidance': 'medium',
  'light-verb-role': 'low',
  'vague-attribution': 'medium',
  'throat-clearing': 'medium',
  'passive-actor-hiding': 'medium',
  'false-agency': 'medium',
  'rhetorical-scaffolding': 'medium',
  'negative-list-buildup': 'medium',
  'modal-redundancy': 'medium',
  'hedging-seesaw': 'low',
  'dramatic-fragment': 'low',
  'significance-idioms': 'medium',
  'promo-idioms': 'medium',
  'chatbot-idioms': 'high',
  'ai-vocabulary': 'low',
  'emerging-slop-phrases': 'low',
  'opening-conjunction': 'low',
  'em-dash-overuse': 'low',
  'mixed-quotes': 'medium',
  'generation-artifacts': 'high',
  emoji: 'low',
  'unsupported-certainty': 'low',
  'vague-declarative': 'low',
  'outline-conclusion': 'low',
  'uniform-rhythm': 'low',
  'mechanical-outline': 'low',
  'absolute-claim': 'low',
  'vague-quantifier': 'low',
  'semantic-redundancy': 'low',
  'unsupported-comparison': 'low',
  'evidence-cluster': 'medium',
};

const rules = Object.fromEntries(Object.entries(rawRules).map(([name, rule]) => [
  name,
  { ...rule, meta: { ...rule.meta, defaultConfidence: CONFIDENCE[name as keyof typeof rawRules] } },
])) as Record<keyof typeof rawRules, Rule<any>>;

/** Every rule derives each finding's severity from detector confidence. */
const RECOMMENDED_RULES: Record<string, RuleSetting> = Object.fromEntries(
  Object.keys(rules).map((name) => [`ai-style/${name}`, 'auto'] as const),
);

export const aiStyle = definePack({
  name: 'ai-style',
  rules,
  categories: CATEGORIES,
  configs: {
    recommended: { rules: RECOMMENDED_RULES, minimumSeverity: 'warn' },
    strict: { rules: RECOMMENDED_RULES, minimumSeverity: 'info' },
    ci: { rules: RECOMMENDED_RULES, minimumSeverity: 'error' },
    all: { rules: RECOMMENDED_RULES, minimumSeverity: 'info' },
  },
});

/**
 * Batteries-included config: reports medium/high-confidence findings. Use
 * `strict` for every signal or `ci` for high-confidence findings only.
 */
export const recommended: Config = defineConfig({
  plugins: { 'ai-style': aiStyle },
  extends: [aiStyle.configs!.recommended],
});

export const strict: Config = defineConfig({
  plugins: { 'ai-style': aiStyle },
  extends: [aiStyle.configs!.strict!],
});

export const ci: Config = defineConfig({
  plugins: { 'ai-style': aiStyle },
  extends: [aiStyle.configs!.ci!],
});

export { CATEGORIES, CATEGORY_ORDER, CATEGORY_WEIGHT } from './categories.js';
export { score, verdict, VERDICTS } from './score/index.js';
export type { Model, ScoreResult, DocFeatures } from './score/index.js';
