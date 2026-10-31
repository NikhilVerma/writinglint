import { childrenOf, defineRule, lower, root as rootOf, type Sentence } from 'writinglint-core';
import { overlapsRegion } from './sentence-shape.js';

const WH_WORDS = new Set(['how', 'what', 'why']);
const EXCLUDED_ROLES = new Set(['code', 'heading', 'list-item', 'metadata', 'quotation']);

/**
 * A wh-fragment is a sentence like "What an operation does to the data."
 *
 * It has the shape of a question's answer, but no main clause says anything
 * about it. The reader has to guess the subject from whatever comes next.
 *
 * "What he did matters" is fine, because "matters" is the main clause. There the
 * parser hangs the wh-word below a subject role, so this check leaves it alone.
 *
 * The parser doesn't always read that sentence the same way, so the role alone
 * isn't enough. In "What he did matters", "what" already fills the object of "did",
 * so a verb directly followed by another verb or a noun must start a main clause.
 */
const CAN_FOLLOW_FINISHED_WHAT_CLAUSE = new Set(['AUX', 'NOUN', 'PROPN', 'VERB']);

function isWhFragment(sentence: Sentence): boolean {
  if (!/\.["')\]]*$/u.test(sentence.text)) return false;
  const root = rootOf(sentence.dep);
  const first = sentence.dep.tokens[0];
  if (!root || !first || root.upos !== 'VERB' || first.head !== root.id) return false;
  if (!WH_WORDS.has(lower(first)) || (first.deprel !== 'obj' && first.deprel !== 'advmod')) return false;
  const { tokens } = sentence.dep;
  const reachesMainClause = lower(first) === 'what' && tokens.some((token, index) =>
    token.upos === 'VERB' && CAN_FOLLOW_FINISHED_WHAT_CLAUSE.has(tokens[index + 1]?.upos ?? ''));
  if (reachesMainClause) return false;
  // An auxiliary makes it a question missing its mark: "How do you run it."
  return !childrenOf(sentence.dep, root.id).some((child) => child.deprel === 'aux');
}

/** A sentence that opens with a wh-word and never reaches a main clause. */
export const whFragment = defineRule({
  meta: {
    name: 'wh-fragment',
    category: 'directness',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'A sentence opens with a wh-word but has no main clause, so the reader must guess its subject.',
    },
  },
  create(context) {
    return {
      Document(document) {
        for (const sentence of document.sentences) {
          if (!isWhFragment(sentence) || overlapsRegion(document, sentence, EXCLUDED_ROLES)) continue;
          context.report({
            span: { start: sentence.start, end: sentence.end },
            message: 'This opens like an answer but has no main clause. Name the subject and say what it does.',
          });
        }
      },
    };
  },
});
