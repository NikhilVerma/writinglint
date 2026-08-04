import { defineRule, type Paragraph } from 'writinglint-core';

const ABSOLUTE_RE = /\b(?:always|never|everyone|everything|nobody|nothing|every single|completely|entirely|impossible|guaranteed|cannot|can't|won't ever|will always|no (?:way|chance|possibility)|under all circumstances)\b/gi;
const STRONG_ABSOLUTE_RE = /\b(?:always|never|everyone|everything|nobody|nothing|every single|impossible|guaranteed|won't ever|will always|under all circumstances)\b/i;

function isAsserted(paragraph: Paragraph, start: number): boolean {
  const sentence = paragraph.sentences.find((candidate) => start >= candidate.start && start < candidate.end);
  if (!sentence || sentence.text.includes('?')) return false;
  const before = paragraph.text.slice(Math.max(0, start - paragraph.start - 18), start - paragraph.start);
  if (/\b(?:not|isn't|wasn't|aren't|weren't|hardly)\s*$/i.test(before)) return false;
  if (/^\s*(?:if|unless|whether)\b/i.test(sentence.text)) return false;
  return true;
}

/** Absolutes are candidates for scope/evidence review, promoted only in clusters. */
export const absoluteClaim = defineRule({
  meta: {
    name: 'absolute-claim',
    category: 'vague',
    docs: { description: 'An absolute or universal claim that may exceed the evidence or omit its scope.' },
  },
  create(ctx) {
    return {
      Paragraph(paragraph) {
        const matches = [...paragraph.text.matchAll(ABSOLUTE_RE)];
        const strong = matches.filter((match) => {
          const start = paragraph.start + match.index;
          return STRONG_ABSOLUTE_RE.test(match[0]) && isAsserted(paragraph, start);
        }).length;
        const confidence = strong >= 3 ? 'medium' : 'low';
        for (const match of matches) {
          const start = paragraph.start + match.index;
          ctx.report({
            span: { start, end: start + match[0].length },
            confidence,
            message: matches.length >= 3
              ? `Stacked absolute claims (${matches.length} in this paragraph) overstate certainty. Add the scope, evidence, or exception.`
              : 'Possible overclaim. Check whether this absolute is a demonstrated invariant; otherwise add scope, evidence, or an exception.',
          });
        }
      },
    };
  },
});
