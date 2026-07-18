import { defineRule } from 'writinglint-core';

const CERTAINTY_RE = /\b(?:(?<!think )(?<!write )(?<!communicate )(?<!speak )(?<!see )(?<!state )(?<!explain )clearly(?=\s*(?:,|this\b|that\b|the\b|it\b|we\b|you\b|they\b))|obviously|undoubtedly|certainly|self-evidently|needless to say|without (?:a )?doubt|there (?:is|can be) no (?:doubt|question)|everyone knows|the (?:truth|reality|fact) is|it is clear that|one thing is (?:clear|certain))\b/gi;

/** Confidence language that often substitutes assertion for evidence. */
export const unsupportedCertainty = defineRule({
  meta: {
    name: 'unsupported-certainty',
    category: 'vague',
    docs: { description: 'Confidence language that asserts a conclusion without showing the evidence.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const matches = [...doc.text.matchAll(CERTAINTY_RE)];
        const confidence = matches.length >= 3 ? 'medium' : 'low';
        for (const match of matches) {
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: matches.length >= 3
              ? `Repeated certainty language (${matches.length} instances) asks the reader to accept claims without seeing the support.`
              : 'Possible unsupported certainty. Show the evidence or state the claim without telling the reader it is obvious.',
          });
        }
      },
    };
  },
});
