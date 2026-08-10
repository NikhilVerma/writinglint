import { defineRule } from 'writinglint-core';

export interface SentenceLengthOptions {
  maxWords?: number;
}

export const sentenceLength = defineRule<SentenceLengthOptions>({
  meta: {
    name: 'sentence-length',
    category: 'technical-sentences',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    docs: {
      description: 'Limit procedural sentences to 20 words and descriptive sentences to 25 words (ASD-STE100 Issue 9, rules 5.1 and 6.3).',
    },
  },
  create(context) {
    const maxWords = context.options.maxWords ?? 25;
    return {
      Sentence(sentence) {
        const words = sentence.words.length;
        if (words <= maxWords) return;
        context.report({
          span: { start: sentence.start, end: sentence.end },
          message: `This sentence has ${words} parsed words. The selected technical-English mode permits no more than ${maxWords}.`,
          suggestion: 'Split the sentence without removing necessary technical information.',
        });
      },
    };
  },
});
