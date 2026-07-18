import { defineRule, type Paragraph } from 'writinglint-core';

const STOP = new Set('a an and are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its just may might more most my no not of on one only or our out she should so than that the their them there these they this those to too up us was we were what when where which who why will with would you your'.split(' '));

function contentWords(paragraph: Paragraph): Set<string> {
  return new Set((paragraph.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map((word) => word.replace(/'(?:s|re|ve|ll|d|m)$/i, ''))
    .filter((word) => !STOP.has(word)));
}

function isProceduralList(paragraph: Paragraph): boolean {
  const nonempty = paragraph.text.split(/\r?\n/).filter((line) => line.trim());
  if (nonempty.length < 3) return false;
  const steps = nonempty.filter((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line)).length;
  return steps / nonempty.length >= 0.6;
}

/** Nearby paragraphs that restate substantially the same content. */
export const semanticRedundancy = defineRule({
  meta: {
    name: 'semantic-redundancy',
    category: 'meta',
    docs: { description: 'A nearby paragraph repeats the same content words instead of advancing the argument.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const words = doc.paragraphs.map(contentWords);
        for (let current = 1; current < doc.paragraphs.length; current++) {
          const right = words[current]!;
          if (right.size < 6) continue;
          let best = { similarity: 0, shared: 0, previous: -1 };
          for (let previous = Math.max(0, current - 4); previous < current; previous++) {
            const left = words[previous]!;
            if (left.size < 6) continue;
            const shared = [...right].filter((word) => left.has(word)).length;
            const containment = shared / Math.min(left.size, right.size);
            if (shared >= 5 && containment > best.similarity) best = { similarity: containment, shared, previous };
          }
          if (best.previous === -1 || best.similarity < 0.48) continue;
          const paragraph = doc.paragraphs[current]!;
          const procedural = isProceduralList(paragraph) && isProceduralList(doc.paragraphs[best.previous]!);
          ctx.report({
            span: { start: paragraph.start, end: paragraph.end },
            // Adjacent recipes and checklists intentionally reuse their action
            // vocabulary. Keep the candidate, but do not call that repetition
            // persuasive without a semantic model.
            confidence: best.similarity >= 0.68 && !procedural ? 'medium' : 'low',
            message: `Possible semantic repetition: this paragraph shares ${Math.round(best.similarity * 100)}% of its concrete vocabulary with a nearby paragraph and may restate rather than advance the point.`,
          });
        }
      },
    };
  },
});
