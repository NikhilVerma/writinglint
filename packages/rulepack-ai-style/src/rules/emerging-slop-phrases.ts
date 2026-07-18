import { defineRule } from 'writinglint-core';
import { EMERGING_SLOP_PHRASES, PHRASE_NOTES } from '../lexicons.js';
import { compilePhrases, normalize } from './_lexicon.js';

const phrases = compilePhrases(EMERGING_SLOP_PHRASES);
const LITERAL_LOAD_BEARING = /\b(?:wall|beam|column|masonry|structure|building|roof|foundation)s?\b/i;

/** Fast-moving phrase tells that should remain informational in isolation. */
export const emergingSlopPhrases = defineRule({
  meta: {
    name: 'emerging-slop-phrases',
    category: 'ai-vocab',
    docs: { description: 'Newly common AI-writing phrases, graded as weak evidence in isolation.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const match of normalize(doc.text).matchAll(phrases)) {
          const start = match.index;
          const end = start + match[0].length;
          const canonical = /^load[-\s]bearing$/i.test(match[0]) ? 'load-bearing' : 'the real bottleneck';
          if (canonical === 'load-bearing') {
            const sentence = doc.sentences.find((item) => start >= item.start && start < item.end);
            if (sentence && LITERAL_LOAD_BEARING.test(sentence.text)) continue;
          }
          ctx.report({
            span: { start, end },
            confidence: 'low',
            message: PHRASE_NOTES[canonical]!,
          });
        }
      },
    };
  },
});
