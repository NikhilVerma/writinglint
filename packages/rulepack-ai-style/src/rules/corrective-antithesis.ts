/**
 * Corrective antithesis — the "X, not Y" construction ("Trust the flags, not the
 * number", "a paradigm, not a tool"). A staged contrast that sounds insightful
 * while adding no information; a signature modern-LLM cadence (and, ironically,
 * the one this project's own copy first tripped on).
 *
 * This is the rule that justifies a dependency graph. Its shape is a `conj`/`appos`
 * dependent Y whose COORDINATOR is the negator "not" (a child of Y, immediately
 * preceded by a comma) — a head/child relation no linear token/POS DSL can express
 * without over-firing on ordinary sentential negation ("I did not see the number").
 *
 * Kept distinct from `negative-parallelism`, which owns the "not only X but also Y"
 * form (coordinator "but", with an only/just/also marker). No overlap.
 */
import { byId, childrenOf, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

export const correctiveAntithesis = defineRule({
  meta: {
    name: 'corrective-antithesis',
    category: 'parallelism',
    docs: {
      description: 'The “X, not Y” staged contrast — a modern-AI cadence that adds no information.',
    },
  },
  create(ctx) {
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const y of s.tokens) {
          // Y is coordinated with / apposed to some head X.
          if (y.deprel !== 'conj' && y.deprel !== 'appos') continue;
          // Its coordinator is the negator "not", attached to Y (cc / advmod / etc).
          const not = childrenOf(s, y.id).find((c) => lower(c) === 'not');
          if (!not) continue;
          // Guard: require the ", not" comma so we match the corrective contrast,
          // not sentential negation that happens to sit under a coordinated verb.
          const before = byId(s, not.id - 1);
          if (!before || before.form !== ',') continue;
          // Highlight the whole "X, not Y" — the subtree of the head X (= Y.head),
          // which spans X and its coordinated Y plus the negator.
          const head = byId(s, y.head);
          const toks = head ? subtree(s, head.id) : subtree(s, y.id);
          ctx.report({
            tokens: toks,
            sentence: s,
            message:
              'Corrective antithesis (“X, not Y”) — a staged contrast that sounds insightful without adding information. State the point directly.',
          });
        }
      },
    };
  },
});
