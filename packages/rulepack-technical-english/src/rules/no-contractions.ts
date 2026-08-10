import { defineRule } from 'writinglint-core';

const CONTRACTION = /\b(?:ain['’]t|aren['’]t|can['’]t|couldn['’]t|didn['’]t|doesn['’]t|don['’]t|hadn['’]t|hasn['’]t|haven['’]t|isn['’]t|mightn['’]t|mustn['’]t|needn['’]t|shan['’]t|shouldn['’]t|wasn['’]t|weren['’]t|won['’]t|wouldn['’]t|[A-Za-z]+(?:['’]d|['’]ll|['’]m|['’]re|['’]ve))\b/giu;

export const noContractions = defineRule({
  meta: {
    name: 'no-contractions',
    category: 'technical-words',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    docs: {
      description: 'Do not omit words or use contractions (ASD-STE100 Issue 9, rule 4.2).',
    },
  },
  create(context) {
    return {
      Document(document) {
        for (const match of document.text.matchAll(CONTRACTION)) {
          const start = match.index;
          context.report({
            span: { start, end: start + match[0].length },
            message: `Write “${match[0]}” in full. Technical English does not use contractions.`,
          });
        }
      },
    };
  },
});
