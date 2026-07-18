import { defineRule } from 'writinglint-core';

const QUANTIFIER_RE = /\b(?:almost every|nearly every|every (?:developer|engineer|team|company|provider|user)|most (?:people|developers|engineers|teams|companies|providers|users)|people (?:say|think|believe|assume|expect)|the standard (?:view|account|assumption)|widely (?:used|accepted|known|believed))\b/gi;

export const vagueQuantifier = defineRule({
  meta: {
    name: 'vague-quantifier',
    category: 'vague',
    docs: { description: 'A broad population claim without a named sample, source, or scope.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const matches = [...doc.text.matchAll(QUANTIFIER_RE)];
        const confidence = matches.length >= 3 ? 'medium' : 'low';
        for (const match of matches) {
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: 'Broad population claim. Name the group or evidence, narrow it to your experience, or remove the borrowed consensus.',
          });
        }
      },
    };
  },
});
