import { childrenOf, defineRule, lower, root, type Paragraph, type Sentence } from 'writinglint-core';

const CLOSURE_WORDS = new Set(['all', 'entire', 'full', 'whole']);
const REFERENTS = new Set(['that', 'this']);

function isClosure(sentence: Sentence): { head: string } | undefined {
  const predicate = root(sentence.dep);
  if (!predicate || (predicate.upos !== 'NOUN' && predicate.upos !== 'PRON')) return undefined;
  const children = childrenOf(sentence.dep, predicate.id);
  const subject = children.find((token) =>
    (token.deprel === 'nsubj' || token.deprel.startsWith('nsubj:')) && REFERENTS.has(lower(token)));
  const copula = children.some((token) => token.deprel === 'cop');
  const closure = children.some((token) =>
    (token.deprel === 'amod' || token.deprel === 'det') && CLOSURE_WORDS.has(lower(token)));
  return subject && copula && closure ? { head: lower(predicate) } : undefined;
}

/** A content-free “that is the whole X” aside inserted before the explanation ends. */
export const prematureClosure = defineRule({
  meta: {
    name: 'premature-closure',
    category: 'meta',
    docs: {
      description: 'A summary aside announces that an explanation is complete even though the paragraph immediately continues.',
    },
  },
  create(ctx) {
    return {
      Paragraph(paragraph: Paragraph) {
        if (paragraph.sentences.length < 3) return;
        for (let index = 1; index < paragraph.sentences.length - 1; index++) {
          const sentence = paragraph.sentences[index]!;
          const closure = isClosure(sentence);
          if (!closure) continue;
          const establishedNearby = paragraph.sentences
            .slice(0, index)
            .some((previous) => previous.dep.tokens.some((token) =>
              token.upos === 'NOUN' && lower(token) === closure.head));
          if (!establishedNearby) continue;
          ctx.report({
            span: { start: sentence.start, end: sentence.end },
            confidence: 'medium',
            message: 'Premature closure: this sentence declares the explanation complete, adds no mechanism, and is followed by more explanation. Remove it or replace it with the missing relationship.',
          });
        }
      },
    };
  },
});
