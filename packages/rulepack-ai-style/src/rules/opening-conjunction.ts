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
    const candidates: Array<{ start: number; end: number; phrase: string; sentence: number }> = [];
    return {
      Sentence(sentence) {
        const norm = normalize(sentence.text);
        const head = norm.toLowerCase().replace(/^[\s"'([]+/, '');
        for (const c of OPENERS) {
          if (head.startsWith(c) && /^[\s,.:;]/.test(head.slice(c.length) || ' ')) {
            const idx = norm.toLowerCase().indexOf(c);
            if (idx === -1) break;
            const start = sentence.start + idx;
            candidates.push({ start, end: start + c.length, phrase: c, sentence: sentence.index });
            break;
          }
        }
      },
      DocumentExit(doc) {
        const phraseCounts = new Map<string, number>();
        for (const candidate of candidates) {
          phraseCounts.set(candidate.phrase, (phraseCounts.get(candidate.phrase) ?? 0) + 1);
        }
        const repeatedPhrase = Math.max(0, ...phraseCounts.values());
        const denseWindow = candidates.some((candidate) =>
          candidates.filter((other) => other.sentence >= candidate.sentence && other.sentence <= candidate.sentence + 5).length >= 3);
        const habitual = repeatedPhrase >= 3
          || denseWindow
          || (candidates.length >= 5 && candidates.length / Math.max(1, doc.sentences.length) >= 0.15);
        for (const candidate of candidates) {
          ctx.report({
            span: { start: candidate.start, end: candidate.end },
            confidence: habitual ? 'medium' : 'low',
            message: habitual
              ? `${candidates.length} formulaic sentence transitions recur through this section. Remove the signposts that do not change the argument.`
              : PHRASE_NOTES[candidate.phrase] ?? 'Formulaic transition to open a sentence. Often removable.',
          });
        }
      },
    };
  },
});
