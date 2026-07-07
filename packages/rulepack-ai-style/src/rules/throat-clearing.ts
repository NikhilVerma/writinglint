/**
 * Chatbot throat-clearing — expletive-"it" + copula + [importance adj] + to +
 * [cognition verb]: "It is important to note that …". Structure from the parse;
 * the two adjective/verb slots are small semantic seeds (POS can't open them).
 */
import { child, childrenOf, defineRule, hasChild, lower, subtree, type DepSentence } from '@writinglint/core';

const IMPORTANCE_ADJ = new Set([
  'important', 'critical', 'crucial', 'essential', 'vital', 'key', 'necessary',
  'noteworthy', 'worth', 'worthwhile', 'useful', 'helpful', 'significant', 'imperative', 'interesting',
]);
const COGNITION_VERB = new Set([
  'note', 'mention', 'remember', 'understand', 'consider', 'recognize', 'recognise',
  'realize', 'realise', 'appreciate', 'emphasize', 'emphasise', 'highlight', 'acknowledge',
  'stress', 'underscore', 'clarify', 'point',
]);

export const throatClearing = defineRule({
  meta: {
    name: 'throat-clearing',
    category: 'meta',
    docs: { description: '“it is important to note that …”. If it matters, just say it.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const adj of s.tokens) {
          if (adj.upos !== 'ADJ' || !IMPORTANCE_ADJ.has(lower(adj))) continue;
          if (!hasChild(s, adj.id, 'cop')) continue;
          const subj = child(s, adj.id, 'nsubj');
          if (!subj || lower(subj) !== 'it') continue;
          const verb = childrenOf(s, adj.id).find(
            (c) =>
              (c.deprel === 'xcomp' || c.deprel === 'csubj' || c.deprel === 'advcl' || c.deprel === 'acl') &&
              c.upos === 'VERB' &&
              COGNITION_VERB.has(lower(c)),
          );
          if (!verb) continue;
          ctx.report({
            tokens: [subj, ...subtree(s, adj.id)],
            sentence: s,
            message: 'Throat-clearing (“it is important to note that …”). If it matters, just say it.',
          });
        }
      },
    };
  },
});
