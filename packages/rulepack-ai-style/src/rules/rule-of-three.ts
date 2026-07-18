/**
 * Rule of three — either a head with ≥2 coordinated adjective/adverb siblings,
 * or three balanced finite clauses with their own subjects and a negated beat.
 * The latter catches polished corporate triptychs without matching ordinary
 * shared-subject lists such as "we build, test, and deploy".
 */
import { childrenByRel, childrenOf, defineRule, lower } from 'writinglint-core';

export const ruleOfThree = defineRule({
  meta: {
    name: 'rule-of-three',
    category: 'rule-of-three',
    docs: { description: 'Reflexive triads of modifiers or balanced independent clauses.' },
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
          const conj = childrenByRel(s, h.id, 'conj').filter((token) => token.upos === h.upos);
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

        const predicates = s.tokens.filter((token) =>
          token.upos === 'VERB'
          && childrenOf(s, token.id).some((child) => child.deprel === 'nsubj' || child.deprel.startsWith('nsubj:')),
        );
        const negated = predicates.some((predicate) =>
          childrenOf(s, predicate.id).some((child) => /^(?:not|n['’]t)$/.test(lower(child))),
        );
        const commas = s.tokens.filter((token) => token.form === ',').length;
        const coordinated = s.tokens.some((token) => token.upos === 'CCONJ');
        if (predicates.length === 3 && negated && commas >= 2 && coordinated) {
          const spine = predicates.flatMap((predicate) => [
            ...childrenOf(s, predicate.id).filter((child) =>
              child.deprel === 'nsubj' || child.deprel.startsWith('nsubj:')
              || /^(?:not|n['’]t)$/.test(lower(child)),
            ),
            predicate,
          ]).sort((a, b) => a.id - b.id);
          ctx.report({
            tokens: spine,
            sentence: s,
            confidence: 'low',
            message: 'Three complete clauses form a polished claim, denial, and payoff. Split the sentence if the three-part cadence is doing more work than the facts.',
          });
        }
      },
    };
  },
});
