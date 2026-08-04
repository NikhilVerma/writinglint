/**
 * Negative parallelism — a coordination whose coordinator is "but" and whose
 * first conjunct is negated, with an "only/just/merely" or "also/too" marker:
 * "not [only] X but [also] Y". The marker is what makes it the LLM cadence; a
 * plain "not X but Y" contrast is ordinary human writing (see corrective-antithesis
 * for the "X, not Y" form).
 */
import { child, childrenOf, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

// Adverbs that give the "not ONLY … but ALSO …" cadence (vs a plain human contrast).
const PARALLEL_MARKER = new Set(['only', 'just', 'merely', 'simply', 'also', 'too']);

export const negativeParallelism = defineRule({
  meta: {
    name: 'negative-parallelism',
    category: 'parallelism',
    docs: { description: '“Not (only) X but (also) Y” — a signature LLM cadence.' },
  },
  create(ctx) {
    const matches: Array<{ s: DepSentence; tokens: ReturnType<typeof subtree> }> = [];
    return {
      Sentence(sentence) {
        const s: DepSentence = sentence.dep;
        for (const y of s.tokens) {
          if (y.deprel !== 'conj') continue;
          const cc = child(s, y.id, 'cc');
          if (!cc || lower(cc) !== 'but') continue;
          const x =
            s.tokens[y.head - 1]?.id === y.head
              ? s.tokens[y.head - 1]
              : s.tokens.find((t) => t.id === y.head);
          if (!x) continue;
          const xAdv = childrenOf(s, x.id).map(lower);
          if (!xAdv.includes('not') && !xAdv.includes('neither')) continue;
          const yAdv = childrenOf(s, y.id).map(lower);
          if (![...xAdv, ...yAdv].some((w) => PARALLEL_MARKER.has(w))) continue;
          matches.push({ s, tokens: [...subtree(s, x.id), ...subtree(s, y.id)] });
        }
      },
      DocumentExit() {
        const confidence = matches.length >= 2 ? 'medium' : 'low';
        for (const match of matches) ctx.report({
          tokens: match.tokens,
          sentence: match.s,
          confidence,
          message: confidence === 'medium'
            ? `“Not (only) X but (also) Y” repeats ${matches.length} times, turning contrast into a document cadence.`
            : 'Possible “not (only) X but (also) Y” cadence. One instance may be an ordinary contrast; repetition is the stronger tell.',
        });
      },
    };
  },
});
