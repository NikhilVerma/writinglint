/**
 * Vague attribution — a bare (determiner-less) common-noun subject that heads a
 * clause of assertion (`ccomp`) via a saying-verb: "Experts argue that …",
 * "Studies suggest that …". The "who says so?" is generic; detected structurally
 * (no `det`/`nmod:poss` on the nsubj) with a small saying-verb seed.
 */
import { childrenByRel, defineRule, hasChild, lower, subtree, type DepSentence } from '@better-write/core';

// Verbs of saying/attribution — the semantic half of vague attribution (the
// structural half is a bare, generic subject). "features mean that …" isn't
// weasel; "experts argue that …" is.
const SAYING_VERB = new Set([
  'argue', 'argues', 'argued', 'say', 'says', 'said', 'claim', 'claims', 'claimed', 'suggest',
  'suggests', 'suggested', 'contend', 'contends', 'maintain', 'maintains', 'assert', 'asserts',
  'insist', 'insists', 'believe', 'believes', 'report', 'reports', 'reported', 'observe',
  'observes', 'observed', 'agree', 'agrees', 'warn', 'warns', 'predict', 'predicts', 'indicate',
  'indicates', 'reveal', 'reveals', 'show', 'shows', 'conclude', 'concludes', 'posit', 'posits',
  'allege', 'alleges', 'acknowledge', 'acknowledges', 'note', 'notes',
]);

export const vagueAttribution = defineRule({
  meta: {
    name: 'vague-attribution',
    category: 'vague',
    docs: { description: 'A bare, generic subject asserting a “that …” clause. Name who, or cut it.' },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const v of s.tokens) {
          if (v.upos !== 'VERB') continue;
          if (!hasChild(s, v.id, 'ccomp')) continue;
          if (!SAYING_VERB.has(lower(v))) continue; // an attribution verb, not "features mean …"
          const subj = childrenByRel(s, v.id, 'nsubj').find(
            (n) => n.upos === 'NOUN' && !hasChild(s, n.id, 'det') && !hasChild(s, n.id, 'nmod:poss'),
          );
          if (!subj) continue;
          ctx.report({
            tokens: [...subtree(s, subj.id), v],
            sentence: s,
            message:
              'Unattributed claim — a bare, generic subject asserting a “that …” clause. Name who, or cut it.',
          });
        }
      },
    };
  },
});
