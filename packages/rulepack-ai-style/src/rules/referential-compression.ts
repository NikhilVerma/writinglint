import { defineRule, lower, type Paragraph, type Sentence } from 'writinglint-core';

const BARE_REFERENTS = new Set(['it', 'that', 'this', 'these', 'those', 'they']);
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/m;

function startsWithBareReferent(sentence: Sentence): boolean {
  const first = sentence.dep.tokens.find((token) => token.upos !== 'PUNCT' && token.upos !== 'SYM');
  return first != null
    && BARE_REFERENTS.has(lower(first))
    && (first.deprel === 'nsubj' || first.deprel.startsWith('nsubj:') || first.deprel === 'expl');
}

/** Consecutive pronoun-led sentences that force the reader to recover the subject. */
export const referentialCompression = defineRule({
  meta: {
    name: 'referential-compression',
    category: 'rhythm',
    docs: {
      description: 'Several nearby sentences open with bare pronouns instead of carrying the subject forward explicitly.',
    },
  },
  create(ctx) {
    return {
      Paragraph(paragraph: Paragraph) {
        if (paragraph.sentences.length < 3 || LIST_ITEM_RE.test(paragraph.text)) return;
        let runStart = -1;
        for (let index = 0; index <= paragraph.sentences.length; index++) {
          const matches = index < paragraph.sentences.length
            && startsWithBareReferent(paragraph.sentences[index]!);
          if (matches && runStart === -1) runStart = index;
          if (matches || runStart === -1) continue;
          const length = index - runStart;
          if (length >= 3) {
            const first = paragraph.sentences[runStart]!;
            const last = paragraph.sentences[index - 1]!;
            ctx.report({
              span: { start: first.start, end: last.end },
              confidence: 'low',
              message: `${length} consecutive sentences open with bare pronouns. Name the subject again or connect the steps so the reader does not have to keep resolving “it”, “this”, or “that”.`,
            });
          }
          runStart = -1;
        }
      },
    };
  },
});
