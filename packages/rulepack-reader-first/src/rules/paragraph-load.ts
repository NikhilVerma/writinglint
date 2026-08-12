import { defineRule } from 'writinglint-core';

/** A prose block whose size makes changes of subject or purpose hard to see. */
export const paragraphLoad = defineRule({
  meta: {
    name: 'paragraph-load',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens'] },
    docs: {
      description: 'A long paragraph hides changes of subject or purpose inside one block.',
    },
  },
  create(context) {
    return {
      Paragraph(paragraph) {
        const sentences = paragraph.sentences.length;
        const words = paragraph.sentences.reduce((total, sentence) => total + sentence.words.length, 0);
        if (sentences < 7 || words < 130) return;
        context.report({
          span: { start: paragraph.start, end: paragraph.end },
          message: `This paragraph has ${sentences} sentences and ${words} words. Split it where the subject, purpose, or stage changes.`,
          evidence: [{ kind: 'paragraph-load', data: { sentences, words } }],
        });
      },
    };
  },
});
