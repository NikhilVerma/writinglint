import { defineRule } from 'writinglint-core';

const BOLD_LABEL_RE = /^(?:[-*+]\s+)?\*\*([^*\n]{2,100})\*\*(?=\s*[:.]|\s|$)/gm;
const CANNED_HEADING_RE = /^#{1,6}\s+(?:tl;?dr|key takeaways?|takeaways?|final thoughts?|conclusion|wrapping up|the bottom line|why it matters|what this means|looking ahead|quick refresher|comparing|combining|the whole picture|should you[^\n]*)\s*$/gim;
const BREAK_BEFORE_HEADING_RE = /^(?:---|\*\*\*|___)[\t ]*\n(?:[\t ]*\n)?[\t ]*#{1,6}\s+/gm;
const CANNED_LABEL_RE = /^(?:problem|solutions?\s*\d*|result|the key trick|why this works|when to use this|limitations?|pro tip|for structured flows?|for exploratory flows?)\s*[:.]?$/i;

/** Repeated template formatting that makes prose read like generated outline fill. */
export const mechanicalOutline = defineRule({
  meta: {
    name: 'mechanical-outline',
    category: 'formatting',
    docs: { description: 'Repeated bold-label blocks, canned headings, or thematic-break section templates.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const bold = [...doc.text.matchAll(BOLD_LABEL_RE)];
        const headings = [...doc.text.matchAll(CANNED_HEADING_RE)];
        const breaks = [...doc.text.matchAll(BREAK_BEFORE_HEADING_RE)];
        const total = bold.length + headings.length + breaks.length;
        const strongBold = bold.filter((match) => !/^(?:[-*+]\s+)/.test(match[0]) || CANNED_LABEL_RE.test(match[1]?.trim() ?? '')).length;
        const strong = strongBold + headings.length;
        const confidence = strong >= 10
          ? 'high'
          : strong >= 3 || (strong >= 1 && total >= 5) ? 'medium' : 'low';
        for (const match of [...bold, ...headings, ...breaks]) {
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: total >= 3
              ? `Mechanical outline pattern repeats ${total} times. Repeated bold labels, canned headings, or section dividers make the article read like filled-in scaffolding.`
              : 'Possible generated-outline scaffold. Keep the label only if it helps navigation more than direct prose would.',
          });
        }
      },
    };
  },
});
