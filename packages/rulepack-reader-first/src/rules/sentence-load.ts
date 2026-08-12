import { countSentenceUnits, defineRule, type CountPolicy } from 'writinglint-core';

export interface SentenceLoadOptions {
  countPolicy?: CountPolicy;
  reviewWords?: number;
  warningWords?: number;
}

const CLAUSE_BREAK_RE = /[,;:]|\b(?:although|because|but|except|if|unless|when|whereas|which|while)\b/gi;
const TECHNICAL_LABEL_RE = /`[^`\n]+`|\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*_[a-z0-9_]+|[A-Z][A-Z0-9-]{2,})\b/g;

/** Long sentences that combine several clauses with technical labels. */
export const sentenceLoad = defineRule<SentenceLoadOptions>({
  meta: {
    name: 'sentence-load',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens'] },
    docs: {
      description: 'A sentence combines enough length, clauses, and technical labels to overload the main point.',
    },
  },
  create(context) {
    return {
      Sentence(sentence) {
        const words = countSentenceUnits(sentence, context.doc, context.options.countPolicy).length;
        const reviewWords = context.options.reviewWords ?? 32;
        const warningWords = context.options.warningWords ?? 40;
        if (words < reviewWords) return;
        const clauseBreaks = [...sentence.text.matchAll(CLAUSE_BREAK_RE)].length;
        const labels = [...sentence.text.matchAll(TECHNICAL_LABEL_RE)].length;
        const overloaded = words >= warningWords || (words >= reviewWords && clauseBreaks >= 4 && labels >= 1);
        if (!overloaded) return;
        context.report({
          span: { start: sentence.start, end: sentence.end },
          confidence: words >= warningWords ? 'medium' : 'low',
          message: `This sentence carries ${words} words, ${clauseBreaks} clause breaks, and ${labels} technical labels. State the main point first, then add conditions in separate sentences.`,
          evidence: [{
            kind: 'sentence-load',
            data: { words, clauseBreaks, technicalLabels: labels, reviewWords, warningWords },
          }],
        });
      },
    };
  },
});
