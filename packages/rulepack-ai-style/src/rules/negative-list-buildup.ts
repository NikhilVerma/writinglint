import { defineRule } from 'writinglint-core';

const NEGATIVE_OPEN = /^(?:not\b|it (?:isn(?:'|’)t|wasn(?:'|’)t)\b)/i;

export const negativeListBuildup = defineRule({
  meta: {
    name: 'negative-list-buildup',
    category: 'parallelism',
    docs: { description: 'Repeatedly lists what something is not before revealing the point.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        let run = 0;
        for (const sentence of doc.sentences) {
          if (NEGATIVE_OPEN.test(sentence.text.trim())) run++;
          else run = 0;
          if (run < 2) continue;
          ctx.report({
            span: { start: sentence.start, end: sentence.end },
            message: 'Negative-list buildup delays the claim for manufactured drama. State what it is directly.',
          });
        }
      },
    };
  },
});
