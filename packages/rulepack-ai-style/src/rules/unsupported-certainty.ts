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
        const located = matches.map((match) => ({
          match,
          sentence: doc.sentences.find((sentence) => match.index >= sentence.start && match.index < sentence.end)?.index,
        }));
        const clustered = new Set<number>();
        for (let left = 0; left < located.length; left++) {
          const start = located[left]!.sentence;
          if (start == null) continue;
          const window = located
            .map((item, index) => ({ ...item, index }))
            .filter((item) => item.sentence != null && item.sentence >= start && item.sentence - start <= 7);
          if (window.length >= 3) for (const item of window) clustered.add(item.index);
        }
        for (const [index, match] of matches.entries()) {
          const confidence = clustered.has(index) ? 'medium' : 'low';
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: confidence === 'medium'
              ? `Certainty language clusters nearby, asking the reader to accept claims without seeing the support.`
              : 'Possible unsupported certainty. Show the evidence or state the claim without telling the reader it is obvious.',
          });
        }
      },
    };
  },
});
