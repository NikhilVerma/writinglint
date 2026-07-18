import { defineRule } from 'writinglint-core';

const CHALLENGE_RE = /\b(?:despite (?:these|the|its) challenges|faces? (?:several|numerous|significant) challenges|challenges and opportunities)\b/gi;
const FUTURE_RE = /\b(?:looking ahead|moving forward|future (?:prospects?|outlook)|the path forward|remains? to be seen|will continue to (?:evolve|grow|shape|play)|only time will tell|the future is (?:bright|promising)|for generations to come)\b/gi;

/** Outline-like ending that balances generic challenges with generic optimism. */
export const outlineConclusion = defineRule({
  meta: {
    name: 'outline-conclusion',
    category: 'meta',
    docs: { description: 'A canned “challenges and future prospects” ending instead of a specific conclusion.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const finalStart = Math.floor(doc.text.length * 0.65);
        const finalText = doc.text.slice(finalStart);
        const challenges = [...finalText.matchAll(CHALLENGE_RE)];
        const futures = [...finalText.matchAll(FUTURE_RE)];
        if (!challenges.length && !futures.length) return;
        const paired = challenges.length > 0 && futures.length > 0;
        const anchor = (challenges[0] ?? futures[0])!;
        const start = finalStart + anchor.index;
        ctx.report({
          span: { start, end: start + anchor[0].length },
          confidence: paired ? 'medium' : 'low',
          message: paired
            ? 'Outline-like conclusion pairs generic challenges with generic future optimism. End on a specific result, limitation, or next action.'
            : 'Possible canned future-looking conclusion. Replace the forecast with a specific result, limitation, or next action.',
        });
      },
    };
  },
});
