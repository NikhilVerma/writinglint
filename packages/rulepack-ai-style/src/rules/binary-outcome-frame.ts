import { defineRule, lower, root, subtree, type Sentence } from 'writinglint-core';

const POSITIVE = new Set(['correct', 'correctly', 'exact', 'exactly', 'good', 'right', 'succeed', 'succeeds', 'success']);
const NEGATIVE = new Set(['bad', 'fail', 'fails', 'failed', 'incorrect', 'incorrectly', 'nonsense', 'wrong']);

const normalizedVerb = (word: string): string => word.toLowerCase().replace(/(?:ed|ing|s)$/, '');

/** Mirrored “do it right and success; do it wrong and failure” outcome framing. */
export const binaryOutcomeFrame = defineRule({
  meta: {
    name: 'binary-outcome-frame',
    category: 'parallelism',
    docs: {
      description: 'Mirrored clauses compress a graded process into a polished right-versus-wrong outcome pair.',
    },
  },
  create(ctx) {
    return {
      Sentence(sentence: Sentence) {
        const semicolon = sentence.dep.tokens.find((token) => token.form === ';');
        const firstPredicate = root(sentence.dep);
        if (!semicolon || !firstPredicate || firstPredicate.upos !== 'VERB') return;
        const mirror = sentence.dep.tokens.find((token) =>
          token.id > semicolon.id
          && (token.deprel === 'conj' || token.deprel === 'parataxis')
          && token.head === firstPredicate.id
          && token.upos === 'VERB'
          && normalizedVerb(token.form) === normalizedVerb(firstPredicate.form));
        if (!mirror) return;

        const before = sentence.dep.tokens.filter((token) => token.id < semicolon.id);
        const after = subtree(sentence.dep, mirror.id);
        const positiveBefore = before.some((token) => POSITIVE.has(lower(token)));
        const negativeBefore = before.some((token) => NEGATIVE.has(lower(token)));
        const positiveAfter = after.some((token) => POSITIVE.has(lower(token)));
        const negativeAfter = after.some((token) => NEGATIVE.has(lower(token)));
        if (!((positiveBefore && negativeAfter) || (negativeBefore && positiveAfter))) return;

        ctx.report({
          span: { start: sentence.start, end: sentence.end },
          confidence: 'medium',
          message: 'Binary outcome frame: mirrored clauses turn a graded process into a neat “right means success; wrong means failure” slogan. Name what changes between the outcomes or state the uncertainty directly.',
        });
      },
    };
  },
});
