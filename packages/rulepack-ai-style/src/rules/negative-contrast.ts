import { childrenOf, defineRule, lower, type DepSentence, type DepToken, type Sentence } from 'writinglint-core';

const REDEFINITION_PRONOUNS = new Set(['it', 'they', 'this', 'these', 'those']);
const NEGATORS = new Set(['not', "n't", 'n’t']);
const words = (sentence: Sentence): number => sentence.words.length;

interface CopularShape {
  root: DepToken;
  subject: DepToken;
  negated: boolean;
}

function copularShape(sentence: Sentence): CopularShape | undefined {
  const graph: DepSentence = sentence.dep;
  const root = graph.tokens.find((token) => token.deprel === 'root');
  if (!root) return undefined;
  const children = childrenOf(graph, root.id);
  const copula = children.find((token) => token.deprel === 'cop');
  if (!copula) return undefined;
  const subject = children.find((token) => token.deprel === 'nsubj' || token.deprel === 'nsubj:pass')
    // The compact parser occasionally labels the pronoun in ASCII “they're”
    // as possessive. Normalize that known parse ambiguity only when the same
    // predicate has a contracted copula; the graph attachment still has to fit.
    ?? (lower(copula) === "'re"
      ? children.find((token) => token.deprel === 'nmod:poss' && token.upos === 'PRON')
      : undefined);
  if (!subject) return undefined;
  return {
    root,
    subject,
    negated: children.some((token) => NEGATORS.has(lower(token))),
  };
}

export const negativeContrast = defineRule({
  meta: {
    name: 'negative-contrast',
    category: 'parallelism',
    docs: { description: 'A negative declaration followed by a dramatic positive redefinition.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const sentence of doc.sentences) {
          if (!/\b(?:is|are|was|were)\s+not\s+[^,;:]{1,100},\s*(?:it|this|they)\s+(?:is|are|was|were)\b/i.test(sentence.text)) continue;
          ctx.report({
            span: { start: sentence.start, end: sentence.end },
            confidence: 'medium',
            message: 'Inline negative redefinition (“X is not Y, it is Z”) stages the implementation choice as a reveal. State the behavior and its consequence directly.',
          });
        }
        for (let index = 0; index < doc.sentences.length - 1; index++) {
          const negative = doc.sentences[index]!;
          const positive = doc.sentences[index + 1]!;
          if (words(negative) > 16 || words(positive) > 14) continue;
          const first = copularShape(negative);
          const second = copularShape(positive);
          if (!first?.negated || !second || second.negated) continue;
          if (second.subject.upos !== 'PRON' || !REDEFINITION_PRONOUNS.has(lower(second.subject))) continue;
          ctx.report({
            span: { start: negative.start, end: positive.end },
            confidence: 'medium',
            message: 'Staged negative contrast (“X is not Y. It is Z.”) manufactures emphasis. State the distinction in one supported claim.',
          });
        }
      },
    };
  },
});
