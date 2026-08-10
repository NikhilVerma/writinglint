import { countSentenceUnits, defineRule, regionsOverlapping, type CountPolicy } from 'writinglint-core';

export interface SentenceLengthOptions {
  maxWords?: number;
  mode?: 'descriptive' | 'procedural';
  countPolicy?: CountPolicy;
}

export const sentenceLength = defineRule<SentenceLengthOptions>({
  meta: {
    name: 'sentence-length',
    category: 'technical-sentences',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens'] },
    docs: {
      description: 'Limit procedural sentences to 20 words and descriptive sentences to 25 words (ASD-STE100 Issue 9, rules 5.1 and 6.3).',
    },
  },
  create(context) {
    const policy = context.options.countPolicy;
    return {
      Sentence(sentence) {
        const regionMode = regionsOverlapping(context.doc.regions, sentence.start, sentence.end)
          .filter(({ mode }) => mode === 'descriptive' || mode === 'procedural')
          .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0]?.mode;
        const mode = regionMode === 'descriptive' || regionMode === 'procedural'
          ? regionMode
          : context.options.mode ?? (context.options.maxWords === 20 ? 'procedural' : 'descriptive');
        const maxWords = regionMode
          ? mode === 'procedural' ? 20 : 25
          : context.options.maxWords ?? (mode === 'procedural' ? 20 : 25);
        const units = countSentenceUnits(sentence, context.doc, policy);
        const words = units.length;
        if (words <= maxWords) return;
        context.report({
          span: { start: sentence.start, end: sentence.end },
          message: `This sentence has ${words} parsed words. The selected technical-English mode permits no more than ${maxWords}.`,
          suggestion: 'Split the sentence without removing necessary technical information.',
          evidence: [
            {
              kind: 'count-policy',
              data: {
                policy: policy?.id ?? 'writinglint/token-count-v1',
                actual: words,
                maximum: maxWords,
                mode,
              },
            },
            ...units.map((unit) => ({
              kind: 'count-unit',
              span: { start: unit.start, end: unit.end },
              data: { kind: unit.kind, text: unit.text },
            })),
          ],
        });
      },
    };
  },
});
