/**
 * Rule of three — a head with ≥2 `conj` siblings of its OWN part of speech,
 * restricted to ADJ/ADV so we flag rhetorical triads, not itemised noun lists.
 */
import { childrenByRel, defineRule } from '@writinglint/core';

export const ruleOfThree = defineRule({
  meta: {
    name: 'rule-of-three',
    category: 'rule-of-three',
    docs: { description: 'Reflexive triads of coordinated adjectives or adverbs.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s = sentence.dep;
        for (const h of s.tokens) {
          // Head must be adjectival/adverbial (excludes itemised noun lists). The
          // conj children aren't upos-filtered: a participial adjective coordinated
          // with an adjective ("lush, sprawling, and chaotic") is often mistagged
          // VERB, but it's still an adjectival co-modifier.
          if (h.upos !== 'ADJ' && h.upos !== 'ADV') continue;
          if (h.deprel !== 'amod' && h.deprel !== 'advmod' && h.deprel !== 'root' && h.deprel !== 'conj')
            continue;
          const conj = childrenByRel(s, h.id, 'conj');
          if (conj.length >= 2) {
            ctx.report({
              tokens: [h, ...conj],
              sentence: s,
              message:
                'Three coordinated ' +
                (h.upos === 'ADJ' ? 'adjectives' : 'adverbs') +
                ' — a reflexive triad. Two usually do the work of three.',
            });
          }
        }
      },
    };
  },
});
