/**
 * Formulaic transitions, but only when they OPEN a sentence — "Moreover,",
 * "Furthermore,", "In conclusion,". Mid-sentence uses are usually fine, so we
 * anchor to the sentence head.
 */
import { defineRule } from 'writinglint-core';
import { OPENING_CONJUNCTIONS, PHRASE_NOTES } from '../lexicons.js';
import { normalize } from './_lexicon.js';

const OPENERS = OPENING_CONJUNCTIONS.map((c) => normalize(c).toLowerCase());

export const openingConjunction = defineRule({
  meta: {
    name: 'opening-conjunction',
    category: 'conjunctions',
    docs: { description: 'Formulaic sentence-opening transitions. Often removable.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const norm = normalize(sentence.text);
        const head = norm.toLowerCase().replace(/^[\s"'([]+/, '');
        for (const c of OPENERS) {
          if (head.startsWith(c) && /^[\s,.:;]/.test(head.slice(c.length) || ' ')) {
            const idx = norm.toLowerCase().indexOf(c);
            if (idx === -1) break;
            const start = sentence.start + idx;
            ctx.report({
              span: { start, end: start + c.length },
              message: PHRASE_NOTES[c] ?? 'Formulaic transition to open a sentence. Often removable.',
            });
            break;
          }
        }
      },
    };
  },
});
