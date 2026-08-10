import { defineRule } from 'writinglint-core';

export const noSemicolon = defineRule({
  meta: {
    name: 'no-semicolon',
    category: 'technical-punctuation',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    docs: {
      description: 'Do not use semicolons in technical English (ASD-STE100 Issue 9, rule 8.1).',
    },
  },
  create(context) {
    return {
      Document(document) {
        for (let index = document.text.indexOf(';'); index !== -1; index = document.text.indexOf(';', index + 1)) {
          context.report({
            span: { start: index, end: index + 1 },
            message: 'Do not use a semicolon. Split the text into separate sentences or use permitted punctuation.',
          });
        }
      },
    };
  },
});
