import { defineConfig, definePack, type RuleSetting } from 'writinglint-core';
import { CATEGORIES } from './categories.js';
export { buildReadingTrace, canonicalEntityKey } from './reading-trace.js';
export type { BufferEvent, BufferEventKind, BufferEventReason, BufferItemKind, DecisionStandardEvent, EntityMention, IdeaEvent, LoadSnapshot, OpenDecisionStandard, OpenIdea, ParticipantRole, Proposition, PropositionParticipant, Reactivation, ReadingMoment, ReadingTrace, ReadingUnitKind, ReadingUnitTrace, RoleChange, TraceRelationship } from './reading-trace.js';
import { abstractReferenceChain } from './rules/abstract-reference-chain.js';
import { asidePileup } from './rules/aside-pileup.js';
import { conceptIntroductionBurst } from './rules/concept-introduction-burst.js';
import { fragmentChain } from './rules/fragment-chain.js';
import { labelLedExplanation } from './rules/label-led-explanation.js';
import { nounPile } from './rules/noun-pile.js';
import { paragraphLoad } from './rules/paragraph-load.js';
import { procedureThreadDetour } from './rules/procedure-thread-detour.js';
import { relationshipPileup } from './rules/relationship-pileup.js';
import { sentenceLoad } from './rules/sentence-load.js';
import { sustainedBufferPressure } from './rules/sustained-buffer-pressure.js';
import { unexplainedInitialism } from './rules/unexplained-initialism.js';
import { undefinedDecisionStack } from './rules/undefined-decision-stack.js';
import { unorientedReactivation } from './rules/unoriented-reactivation.js';
import { unresolvedIdeaStack } from './rules/unresolved-idea-stack.js';

const rules = {
  'abstract-reference-chain': abstractReferenceChain,
  'aside-pileup': asidePileup,
  'concept-introduction-burst': conceptIntroductionBurst,
  'fragment-chain': fragmentChain,
  'label-led-explanation': labelLedExplanation,
  'noun-pile': nounPile,
  'paragraph-load': paragraphLoad,
  'procedure-thread-detour': procedureThreadDetour,
  'relationship-pileup': relationshipPileup,
  'sentence-load': sentenceLoad,
  'sustained-buffer-pressure': sustainedBufferPressure,
  'unexplained-initialism': unexplainedInitialism,
  'undefined-decision-stack': undefinedDecisionStack,
  'unoriented-reactivation': unorientedReactivation,
  'unresolved-idea-stack': unresolvedIdeaStack,
};

const ruleSettings = (names: readonly string[]): Record<string, RuleSetting> => Object.fromEntries(
  names.map((name) => [`reader-first/${name}`, 'auto']),
);
const recommendedRules = ruleSettings(Object.keys(rules));

export const readerFirst = definePack({
  name: 'reader-first',
  rules,
  categories: CATEGORIES,
  configs: {
    recommended: { rules: recommendedRules, minimumSeverity: 'warn' },
    strict: { rules: recommendedRules, minimumSeverity: 'info' },
    ci: { rules: recommendedRules, minimumSeverity: 'error' },
  },
});

/** Reader-first prose checks for normal product and engineering explanations. */
export const recommended = defineConfig({
  plugins: { 'reader-first': readerFirst },
  rules: recommendedRules,
  minimumSeverity: 'warn',
});

/** Include tentative review signals as well as normal warnings. */
export const strict = defineConfig({
  plugins: { 'reader-first': readerFirst },
  rules: recommendedRules,
  minimumSeverity: 'info',
});

/** Keep only high-confidence errors for blocking CI. */
export const ci = defineConfig({
  extends: [recommended],
  minimumSeverity: 'error',
});

export { CATEGORIES } from './categories.js';
export { abstractReferenceChain } from './rules/abstract-reference-chain.js';
export { asidePileup } from './rules/aside-pileup.js';
export { conceptIntroductionBurst } from './rules/concept-introduction-burst.js';
export { fragmentChain } from './rules/fragment-chain.js';
export { labelLedExplanation } from './rules/label-led-explanation.js';
export { nounPile } from './rules/noun-pile.js';
export { paragraphLoad } from './rules/paragraph-load.js';
export { procedureThreadDetour } from './rules/procedure-thread-detour.js';
export { relationshipPileup } from './rules/relationship-pileup.js';
export { sentenceLoad } from './rules/sentence-load.js';
export { sustainedBufferPressure } from './rules/sustained-buffer-pressure.js';
export { unexplainedInitialism } from './rules/unexplained-initialism.js';
export { undefinedDecisionStack } from './rules/undefined-decision-stack.js';
export { unorientedReactivation } from './rules/unoriented-reactivation.js';
export { unresolvedIdeaStack } from './rules/unresolved-idea-stack.js';
