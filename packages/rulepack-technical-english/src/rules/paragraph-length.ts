import { defineRule } from 'writinglint-core';

export const paragraphLength = defineRule({
  meta: {
    name: 'paragraph-length',
    category: 'technical-paragraphs',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    docs: {
      description: 'Use no more than six sentences in a descriptive paragraph (ASD-STE100 Issue 9, rule 6.6).',
    },
  },
  create(context) {
    return {
      Paragraph(paragraph) {
        if (paragraph.sentences.length <= 6) return;
        context.report({
          span: { start: paragraph.start, end: paragraph.end },
          message: `This paragraph has ${paragraph.sentences.length} sentences. A descriptive paragraph can have no more than six.`,
          suggestion: 'Divide the paragraph where its subject or purpose changes.',
        });
      },
    };
  },
});
