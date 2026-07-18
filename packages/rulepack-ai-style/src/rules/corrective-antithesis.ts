/**
 * Corrective antithesis — the "X, not Y" construction ("Trust the flags, not the
 * number", "a paradigm, not a tool"). A staged contrast that sounds insightful
 * while adding no information; a signature modern-LLM cadence (and, ironically,
 * the one this project's own copy first tripped on).
 *
 * This is the rule that justifies a dependency graph. Its shape is a `conj`/`appos`/`parataxis`
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
    const matches: Array<{ s: DepSentence; tokens: ReturnType<typeof subtree> }> = [];
    return {
      Document(doc) {
        for (const sentence of doc.sentences) {
          const s: DepSentence = sentence.dep;
          const rhetoricalFrame = /\b(?:am|is|are|was|were|be|been|being)\b[^.!?]{0,100},\s*not\b/i.test(sentence.text)
            || /^\s*(?:trust|choose)\b[^.!?]{0,100},\s*not\b/i.test(sentence.text);
          if (!rhetoricalFrame) continue;
          for (const y of s.tokens) {
          // Y is coordinated with, apposed to, or a corrective parataxis of X.
          if (y.deprel !== 'conj' && y.deprel !== 'appos' && y.deprel !== 'parataxis') continue;
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
          const contrastHead = byId(s, before.id - 1);
          const toks = y.deprel === 'parataxis'
            ? [...(contrastHead ? subtree(s, contrastHead.id) : []), ...subtree(s, y.id)]
            : head ? subtree(s, head.id) : subtree(s, y.id);
            matches.push({ s, tokens: toks });
          }
        }
        // A single contrast is weak evidence, but still useful in a strict
        // editorial audit. Repetition promotes the same construction instead
        // of making the singleton disappear entirely.
        const confidence = matches.length >= 4 ? 'high' : matches.length >= 2 ? 'medium' : 'low';
        for (const match of matches) ctx.report({
          tokens: match.tokens,
          sentence: match.s,
          confidence,
          message: matches.length === 1
            ? 'Possible corrective antithesis (“X, not Y”). The contrast may manufacture emphasis; state the point directly if the contrast is not doing real work.'
            : `Repeated corrective antithesis (“X, not Y”) — ${matches.length} instances create a staged AI cadence. State the contrasts directly.`,
        });
      },
    };
  },
});
