import { defineRule } from 'writinglint-core';

const COMPARISON_RE = /\b(?:the (?:best|fastest|easiest|simplest|most reliable|most effective)|far (?:more|less|better|worse|faster|slower)|much (?:more|less|better|worse|faster|slower)|significantly (?:more|less|better|worse|faster|slower|reduces?|improves?)|dramatically (?:more|less|better|worse|faster|slower|reduces?|improves?)|outperforms?|beats? (?:a|the|any|every|larger|smaller|bigger)|a fraction of (?:the )?cost|orders? of magnitude|\d+(?:\.\d+)?\s*(?:x|times) (?:faster|slower|better|worse)|complete(?:ly)? (?:prevents?|eliminates?|removes?)|very high)\b/gi;
const STRONG_COMPARISON_RE = /\b(?:the fastest|outperforms?|beats? (?:a|the|any|every|larger|smaller|bigger)|a fraction of (?:the )?cost|\d+(?:\.\d+)?\s*(?:x|times) (?:faster|slower|better|worse)|complete(?:ly)? (?:prevents?|eliminates?|removes?)|very high)\b/i;

/** Comparative outcome language that needs a benchmark, measurement, or scope. */
export const unsupportedComparison = defineRule({
  meta: {
    name: 'unsupported-comparison',
    category: 'vague',
    docs: { description: 'A comparative, superlative, or outcome claim without an explicit benchmark in the phrase.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const matches = [...doc.text.matchAll(COMPARISON_RE)];
        for (const match of matches) {
          const confidence = STRONG_COMPARISON_RE.test(match[0]) ? 'medium' : 'low';
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: confidence === 'medium'
              ? 'Strong comparative or outcome claim. Supply measurements and a baseline, or narrow the claim.'
              : 'Possible unsupported comparison. Name the benchmark, measurement, and scope, or make the claim less categorical.',
          });
        }
      },
    };
  },
});
