import { defineConfig, definePack, type RuleSetting } from 'writinglint-core';
import { CATEGORIES } from './categories.js';
import { nounPile } from './rules/noun-pile.js';
import { paragraphLoad } from './rules/paragraph-load.js';
import { sentenceLoad } from './rules/sentence-load.js';
import { unexplainedInitialism } from './rules/unexplained-initialism.js';

const rules = {
  'noun-pile': nounPile,
  'paragraph-load': paragraphLoad,
  'sentence-load': sentenceLoad,
  'unexplained-initialism': unexplainedInitialism,
};

const recommendedRules: Record<string, RuleSetting> = Object.fromEntries(
  Object.keys(rules).map((name) => [`reader-first/${name}`, 'auto']),
);

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
  extends: [recommended],
  minimumSeverity: 'info',
});

/** Keep only high-confidence errors for blocking CI. */
export const ci = defineConfig({
  extends: [recommended],
  minimumSeverity: 'error',
});

export { CATEGORIES } from './categories.js';
export { nounPile } from './rules/noun-pile.js';
export { paragraphLoad } from './rules/paragraph-load.js';
export { sentenceLoad } from './rules/sentence-load.js';
export { unexplainedInitialism } from './rules/unexplained-initialism.js';
