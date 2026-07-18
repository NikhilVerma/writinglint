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
      Document(doc) {
        const candidates = doc.tokens.filter((token) => {
          if (!VOCAB.has(token.lower)) return false;
          if (token.lower === 'harness' && token.upos !== 'VERB') return false;
          const sentence = doc.sentences[token.sentence]?.text ?? '';
          return !/\b(?:words?|phrases?|vocabulary)\b.*\b(?:such as|including|like)\b|\b(?:ai|llm|model|chatbot)s?\b.*\b(?:produce|output|write|writing|word|phrase|say|sentence|vocabulary)s?\b|\b(?:words?|phrases?|vocabulary)\b.*\b(?:ai|llm|model|chatbot)s?\b/i.test(sentence);
        });
        const words = Math.max(1, doc.tokens.filter((token) => /^(?:NOUN|PROPN|VERB|ADJ|ADV)$/.test(token.upos)).length);
        const density = (candidates.length / words) * 100;
        const confidence = candidates.length >= 4 && density >= 1.5 ? 'medium' : 'low';
        for (const t of candidates) {
          ctx.report({
            span: { start: t.start, end: t.end },
            confidence,
            message: PHRASE_NOTES[t.lower] ?? 'Word LLMs over-use. Consider a plainer choice.',
          });
        }
      },
    };
  },
});
