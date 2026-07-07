/**
 * Copula avoidance — a non-"be" verb predicating via "as a NOUN"
 * ("X stands/serves as a testament"), instead of a plain "is".
 */
import { childrenByRel, childrenOf, defineRule, hasChild, lower, subtree, type DepSentence } from '@better-write/core';

const COPULA_SUB = new Set([
  'stand', 'stands', 'stood', 'serve', 'serves', 'served', 'act', 'acts', 'acted',
  'function', 'functions', 'functioned', 'emerge', 'emerges', 'emerged', 'represent',
  'represents', 'remain', 'remains', 'remained', 'constitute', 'constitutes', 'embody', 'embodies',
]);

export const copulaAvoidance = defineRule({
  meta: {
    name: 'copula-avoidance',
    category: 'significance',
    docs: { description: '“stands/serves as a …” dressing up a plain “is a …”.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const v of s.tokens) {
          if (v.upos !== 'VERB' || !COPULA_SUB.has(lower(v))) continue;
          if (!hasChild(s, v.id, 'nsubj')) continue;
          const obl = childrenByRel(s, v.id, 'obl').find(
            (o) =>
              (o.upos === 'NOUN' || o.upos === 'PROPN') &&
              childrenOf(s, o.id).some((c) => c.deprel === 'case' && lower(c) === 'as'),
          );
          if (!obl) continue;
          ctx.report({
            tokens: [v, ...subtree(s, obl.id)],
            sentence: s,
            message: `Copula avoidance — “${lower(v)} as a …” dressing up a plain “is a …”.`,
          });
        }
      },
    };
  },
});
