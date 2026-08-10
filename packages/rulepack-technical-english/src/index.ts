import { defineConfig, definePack, type Config, type Lint, type RuleSetting } from 'writinglint-core';
import { CATEGORIES } from './categories.js';
import { dictionaryPartOfSpeech, dictionaryWordApproval } from './rules/dictionary-word-approval.js';
import { noContractions } from './rules/no-contractions.js';
import { noSemicolon } from './rules/no-semicolon.js';
import { paragraphLength } from './rules/paragraph-length.js';
import { passiveVoice } from './rules/passive-voice.js';
import { sentenceLength } from './rules/sentence-length.js';
import {
  ISSUE_9_RULE_IDS,
  asdSte100TerminologyProvider,
  terminologyFingerprint,
  type AsdSte100Issue9StandardData,
} from './standard-data.js';

const rules = {
  'dictionary-part-of-speech': dictionaryPartOfSpeech,
  'dictionary-word-approval': dictionaryWordApproval,
  'no-contractions': noContractions,
  'no-semicolon': noSemicolon,
  'paragraph-length': paragraphLength,
  'passive-voice': passiveVoice,
  'sentence-length': sentenceLength,
};

const STANDARD_DATA_RULES = (standardData: AsdSte100Issue9StandardData): Record<string, RuleSetting> => ({
  'technical-english/dictionary-part-of-speech': ['warn', { provider: asdSte100TerminologyProvider(standardData) }],
  'technical-english/dictionary-word-approval': ['error', { provider: asdSte100TerminologyProvider(standardData) }],
});

const DESCRIPTIVE_RULES: Record<string, RuleSetting> = {
  'technical-english/no-contractions': 'error',
  'technical-english/no-semicolon': 'error',
  'technical-english/paragraph-length': 'error',
  'technical-english/passive-voice': ['warn', { mode: 'descriptive' }],
  'technical-english/sentence-length': ['warn', { mode: 'descriptive', maxWords: 25 }],
};

const PROCEDURAL_RULES: Record<string, RuleSetting> = {
  'technical-english/no-contractions': 'error',
  'technical-english/no-semicolon': 'error',
  'technical-english/paragraph-length': 'off',
  'technical-english/passive-voice': ['warn', { mode: 'procedural' }],
  'technical-english/sentence-length': ['warn', { mode: 'procedural', maxWords: 20 }],
};

export const technicalEnglish = definePack({
  name: 'technical-english',
  rules,
  categories: CATEGORIES,
  configs: {
    descriptive: { rules: DESCRIPTIVE_RULES },
    procedural: { rules: PROCEDURAL_RULES },
  },
});

export const descriptive: Config = defineConfig({
  plugins: { 'technical-english': technicalEnglish },
  extends: [technicalEnglish.configs!.descriptive!],
});

export const procedural: Config = defineConfig({
  plugins: { 'technical-english': technicalEnglish },
  extends: [technicalEnglish.configs!.procedural!],
});

export function withAsdSte100StandardData(
  mode: 'descriptive' | 'procedural',
  standardData: AsdSte100Issue9StandardData,
): Config {
  return defineConfig({
    extends: [mode === 'procedural' ? procedural : descriptive],
    rules: STANDARD_DATA_RULES(standardData),
  });
}

const AUTOMATED_RULE_DETECTORS = {
  '3.6': ['technical-english/passive-voice'],
  '4.2': ['technical-english/no-contractions'],
  '5.1': ['technical-english/sentence-length'],
  '6.3': ['technical-english/sentence-length'],
  '6.6': ['technical-english/paragraph-length'],
  '8.1': ['technical-english/no-semicolon'],
} as const;

const STANDARD_DATA_RULE_DETECTORS = {
  '1.1': ['technical-english/dictionary-word-approval'],
  '1.2': ['technical-english/dictionary-part-of-speech'],
} as const;

const AUTOMATED_RULES = new Set(Object.keys(AUTOMATED_RULE_DETECTORS));
const STANDARD_DATA_RULES_SET = new Set(Object.keys(STANDARD_DATA_RULE_DETECTORS));

export const ASD_STE100_ISSUE_9_COVERAGE = {
  standard: 'ASD-STE100',
  issue: 9,
  publicationDate: '2025-01-15',
  implementation: 'independent-partial-check',
  ruleCount: 53,
  automatedRules: [...AUTOMATED_RULES],
  standardDataAssistedRules: [...STANDARD_DATA_RULES_SET],
  ruleCoverage: ISSUE_9_RULE_IDS.map((rule) => ({
    rule,
    status: AUTOMATED_RULES.has(rule)
      ? 'automated'
      : STANDARD_DATA_RULES_SET.has(rule)
        ? 'assisted'
        : 'review-required',
    detectors: rule in AUTOMATED_RULE_DETECTORS
      ? AUTOMATED_RULE_DETECTORS[rule as keyof typeof AUTOMATED_RULE_DETECTORS]
      : rule in STANDARD_DATA_RULE_DETECTORS
        ? STANDARD_DATA_RULE_DETECTORS[rule as keyof typeof STANDARD_DATA_RULE_DETECTORS]
      : [],
  })),
  reviewRequired: [
    'The controlled dictionary and approved meanings',
    'Project-specific technical names and technical verbs',
    'Rules that require meaning, risk, or document-context judgments',
    'Special word-count treatment that the parser cannot establish with certainty',
  ],
  disclaimer: 'This project is independent. ASD does not certify, authorize, approve, or endorse this software.',
} as const;

export interface AsdSte100Issue9Assessment {
  standard: 'ASD-STE100';
  issue: 9;
  publicationDate: '2025-01-15';
  status: 'nonconformant' | 'review-required';
  automatedRuleFindings: number;
  automatedRules: readonly string[];
  executedRules: readonly string[];
  standardData: {
    loaded: boolean;
    fingerprint?: string;
    parserVersion?: string;
  };
  reviewRequired: readonly string[];
  disclaimer: string;
}

/**
 * Summarize the automated Issue 9 checks without treating partial automation as
 * proof of compliance. A high-confidence error establishes nonconformance. Any
 * other result still needs the controlled dictionary and human review.
 */
export function assessAsdSte100Issue9(
  lints: readonly Lint[],
  options: { standardData?: AsdSte100Issue9StandardData } = {},
): AsdSte100Issue9Assessment {
  const technicalLints = lints.filter((lint) => lint.ruleId.startsWith('technical-english/'));
  const standardDataRules = options.standardData ? [...STANDARD_DATA_RULES_SET] : [];
  const reviewRequired = options.standardData
    ? [
        'Approved meanings and ambiguous word senses',
        ...ASD_STE100_ISSUE_9_COVERAGE.reviewRequired.slice(1),
      ]
    : ASD_STE100_ISSUE_9_COVERAGE.reviewRequired;
  return {
    standard: 'ASD-STE100',
    issue: 9,
    publicationDate: ASD_STE100_ISSUE_9_COVERAGE.publicationDate,
    status: technicalLints.some((lint) => lint.severity === 'error') ? 'nonconformant' : 'review-required',
    automatedRuleFindings: technicalLints.length,
    automatedRules: [...ASD_STE100_ISSUE_9_COVERAGE.automatedRules, ...standardDataRules],
    executedRules: [...ASD_STE100_ISSUE_9_COVERAGE.automatedRules, ...standardDataRules],
    standardData: options.standardData ? {
      loaded: true,
      fingerprint: terminologyFingerprint(options.standardData),
      parserVersion: options.standardData.source.parserVersion,
    } : { loaded: false },
    reviewRequired,
    disclaimer: ASD_STE100_ISSUE_9_COVERAGE.disclaimer,
  };
}

export { CATEGORIES } from './categories.js';
export { noContractions } from './rules/no-contractions.js';
export { noSemicolon } from './rules/no-semicolon.js';
export { paragraphLength } from './rules/paragraph-length.js';
export { passiveVoice, type PassiveVoiceOptions } from './rules/passive-voice.js';
export { sentenceLength, type SentenceLengthOptions } from './rules/sentence-length.js';
export {
  dictionaryPartOfSpeech,
  dictionaryWordApproval,
  type DictionaryOptions,
} from './rules/dictionary-word-approval.js';
export {
  ISSUE_9_RULE_IDS,
  asdSte100TerminologyProvider,
  parseAsdSte100Issue9StandardData,
  terminologyFingerprint,
  type AsdSte100Issue9StandardData,
  type Issue9RuleId,
  type TerminologyEntry,
  type TerminologyPartOfSpeech,
} from './standard-data.js';
