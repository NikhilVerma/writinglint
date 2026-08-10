import { defineRule, regionsOverlapping } from 'writinglint-core';

export const paragraphLength = defineRule({
  meta: {
    name: 'paragraph-length',
    category: 'technical-paragraphs',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    requires: { parser: ['sentence-boundaries'] },
    docs: {
      description: 'Use no more than six sentences in a descriptive paragraph (ASD-STE100 Issue 9, rule 6.6).',
    },
  },
  create(context) {
    return {
      Paragraph(paragraph) {
        const mode = regionsOverlapping(context.doc.regions, paragraph.start, paragraph.end)
          .filter((region) => region.mode === 'descriptive' || region.mode === 'procedural')
          .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0]?.mode;
        if (mode === 'procedural') return;
        if (paragraph.sentences.length <= 6) return;
        context.report({
          span: { start: paragraph.start, end: paragraph.end },
          message: `This paragraph has ${paragraph.sentences.length} sentences. A descriptive paragraph can have no more than six.`,
          suggestion: 'Divide the paragraph where its subject or purpose changes.',
          evidence: [{
            kind: 'paragraph-sentence-count',
            data: { actual: paragraph.sentences.length, maximum: 6, mode: mode ?? 'descriptive' },
          }],
        });
      },
    };
  },
});
