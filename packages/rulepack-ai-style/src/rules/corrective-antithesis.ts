/**
 * Corrective antithesis — the "X, not Y" construction ("Trust the flags, not the
 * number", "a paradigm, not a tool"). A staged contrast that sounds insightful
 * while adding no information; a signature modern-LLM cadence (and, ironically,
 * the one this project's own copy first tripped on).
 *
 * This is the rule that justifies a dependency graph. Its usual shape is a
 * `conj`/`appos`/`parataxis` dependent Y whose coordinator is the negator "not".
 * It also covers a negated relative clause attached to X ("the writing, not who
 * wrote it"). In both cases, "not" must be a child of Y and immediately preceded
 * by a comma — a relation no linear token/POS DSL can express without over-firing
 * on ordinary sentential negation ("I did not see the number").
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
          for (const y of s.tokens) {
            const coordinated = y.deprel === 'conj' || y.deprel === 'appos' || y.deprel === 'parataxis';
            const relativeClause = y.deprel === 'acl:relcl';
            const not = childrenOf(s, y.id).find((c) => lower(c) === 'not');
            if (!not) continue;
            const whSubject = childrenOf(s, y.id).some((child) =>
              (child.deprel === 'nsubj' || child.deprel.startsWith('nsubj:'))
              && /^(?:who|what|which)$/.test(lower(child)),
            );
            // The broad coordinated form needs a rhetorical frame so ordinary
            // instructions such as "Use names, not IDs" remain unflagged. A
            // relative clause, including a compact-parser `conj` with an
            // explicit wh-subject, is already a much narrower graph shape.
            if ((!coordinated || (!rhetoricalFrame && !whSubject)) && !relativeClause) continue;
            const before = byId(s, not.id - 1);
            if (!before || before.form !== ',') continue;

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
