/**
 * Light-verb significance — "plays/serves a [ADJ] role/part" (adjective open):
 * asserts importance without saying what the thing actually does.
 */
import { childrenByRel, defineRule, lower, subtree, type DepSentence } from '@writinglint/core';

const LIGHT_VERB = new Set([
  'play', 'plays', 'played', 'serve', 'serves', 'served', 'occupy', 'occupies', 'occupied',
  'hold', 'holds', 'held', 'assume', 'assumes', 'assumed', 'fill', 'fills', 'filled',
]);
const ROLE_NOUN = new Set(['role', 'part', 'function']);

export const lightVerbRole = defineRule({
  meta: {
    name: 'light-verb-role',
    category: 'significance',
    docs: { description: '“plays a … role” — importance asserted, not shown.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const v of s.tokens) {
          if (v.upos !== 'VERB' || !LIGHT_VERB.has(lower(v))) continue;
          const obj = childrenByRel(s, v.id, 'obj').find((o) => ROLE_NOUN.has(lower(o)));
          if (!obj) continue;
          const amod = childrenByRel(s, obj.id, 'amod').find((a) => a.upos === 'ADJ');
          if (!amod) continue;
          ctx.report({
            tokens: [v, ...subtree(s, obj.id)],
            sentence: s,
            message:
              'Light-verb inflation — “plays a … role” asserts importance without saying what it does.',
          });
        }
      },
    };
  },
});
