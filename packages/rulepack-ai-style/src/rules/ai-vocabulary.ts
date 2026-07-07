/**
 * Single-word AI vocabulary — inherently lexical (a word-frequency signal):
 * words LLMs reach for far more often than people do (delve, tapestry,
 * meticulous …). Wikipedia's own high-density list, kept in the lexicon.
 */
import { defineRule } from 'writinglint-core';
import { AI_VOCAB, PHRASE_NOTES } from '../lexicons.js';

const VOCAB = new Set(AI_VOCAB.map((w) => w.toLowerCase()));

export const aiVocabulary = defineRule({
  meta: {
    name: 'ai-vocabulary',
    category: 'ai-vocab',
    docs: { description: 'Words LLMs over-use relative to human writers.' },
  },
  create(ctx) {
    return {
      Token(t) {
        if (VOCAB.has(t.lower)) {
          ctx.report({
            span: { start: t.start, end: t.end },
            message: PHRASE_NOTES[t.lower] ?? 'Word LLMs over-use. Consider a plainer choice.',
          });
        }
      },
    };
  },
});
