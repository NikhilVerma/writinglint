import { defineRule } from 'writinglint-core';

// Narrowly targets the duplicated possibility/future frame from paired notes:
// “You can X or Y; both will give ...”. It does not flag ordinary future tense.
const DUPLICATED_MODAL_RE = /\byou can\b[^.;!?]+\bor\b[^.;!?]+;\s*both\s+(will\s+)(?:give|produce|create|yield|lead|result)\b/gi;

export const modalRedundancy = defineRule({
  meta: {
    name: 'modal-redundancy',
    category: 'meta',
    docs: { description: 'Repeats modality after two possibilities already establish the outcome.' },
    fixable: 'text',
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const match of doc.text.matchAll(DUPLICATED_MODAL_RE)) {
          const whole = match[0];
          const local = whole.lastIndexOf(match[1]);
          const start = match.index + local;
          ctx.report({
            span: { start, end: start + match[1].length },
            message: 'The second modal repeats an outcome already established by “can”. Use the direct verb.',
            fix: { range: [start, start + match[1].length], text: '' },
          });
        }
      },
    };
  },
});
