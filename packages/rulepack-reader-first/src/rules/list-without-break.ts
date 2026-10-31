import { defineRule } from 'writinglint-core';

// U+2029 is what the Markdown extractor puts after a list marker.
const LIST_MARKER_RE = /^[\t ]*(?:[-+*]|\d+[.)])[\u2029\t ]/u;
const FINISHED_SENTENCE_RE = /[.!?]["')\]]*[\t ]*$/u;

/** A list pressed against the prose before it, which hides where the list starts. */
export const listWithoutBreak = defineRule({
  meta: {
    name: 'list-without-break',
    category: 'directness',
    defaultSeverity: 'info',
    defaultConfidence: 'low',
    requires: { parser: ['sentence-boundaries'] },
    docs: {
      description: 'A list starts straight after a finished sentence with no blank line, so it runs into the paragraph.',
    },
  },
  create(context) {
    return {
      Document(document) {
        // Lines since the last blank line, so a wrapped list item still counts
        // as being inside the list and only the first item of a list can fire.
        let block: string[] = [];
        let offset = 0;
        for (const line of document.text.split('\n')) {
          if (!line.trim()) {
            block = [];
          } else {
            // An intro ending in a colon is fine: it says a list is coming.
            if (LIST_MARKER_RE.test(line)
              && block.length > 0
              && !block.some((earlier) => LIST_MARKER_RE.test(earlier))
              && FINISHED_SENTENCE_RE.test(block.at(-1)!)) {
              context.report({
                span: { start: offset + line.search(/\S/u), end: offset + line.trimEnd().length },
                message: 'This list runs straight on from the sentence above. Add a blank line so the reader can see where it starts.',
              });
            }
            block.push(line);
          }
          offset += line.length + 1;
        }
      },
    };
  },
});
