import { defineRule, type Sentence } from 'writinglint-core';

const baseRelation = (relation: string): string => relation.split(':', 1)[0]!;
const isListParagraph = (text: string): boolean =>
  text.split(/\r?\n/).filter((line) => line.trim()).some((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line));

/**
 * A compact grammatical fingerprint. It keeps dependency roles and POS while
 * discarding the words that fill them, so parallel syntax can be found without
 * relying on a canned phrase list.
 */
function frame(sentence: Sentence): string | undefined {
  const tokens = sentence.dep.tokens.filter((token) => token.upos !== 'PUNCT' && token.upos !== 'SYM');
  if (tokens.length < 4) return undefined;
  const prefix = tokens.slice(0, 4).map((token) => `${token.upos}:${baseRelation(token.deprel)}`).join('|');
  const roles = tokens
    .filter((token) => ['nsubj', 'obj', 'iobj', 'obl', 'xcomp', 'ccomp', 'advcl'].includes(baseRelation(token.deprel)))
    .map((token) => `${baseRelation(token.deprel)}:${token.upos}`)
    .join('|');
  const root = tokens.find((token) => token.head === 0);
  return root ? `${root.upos}::${prefix}::${roles}` : undefined;
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return Infinity;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return deviation / mean;
}

/** Repeated dependency frames that make a paragraph sound filled from a template. */
export const repeatedSentenceFrame = defineRule({
  meta: {
    name: 'repeated-sentence-frame',
    category: 'rhythm',
    docs: { description: 'Several nearby sentences repeat the same dependency frame and cadence.' },
  },
  create(ctx) {
    return {
      Paragraph(paragraph) {
        if (paragraph.sentences.length < 3 || isListParagraph(paragraph.text)) return;
        const groups = new Map<string, Sentence[]>();
        for (const sentence of paragraph.sentences) {
          const signature = frame(sentence);
          if (!signature) continue;
          const group = groups.get(signature);
          if (group) group.push(sentence);
          else groups.set(signature, [sentence]);
        }
        const repeated = [...groups.values()].sort((left, right) => right.length - left.length)[0];
        if (!repeated || repeated.length < 3) return;
        const share = repeated.length / paragraph.sentences.length;
        const lengths = repeated.map((sentence) => sentence.words.length);
        if (share < 0.6 || coefficientOfVariation(lengths) > 0.3) return;
        const confidence = repeated.length >= 4 && share >= 0.75 ? 'medium' : 'low';
        ctx.report({
          span: { start: repeated[0]!.start, end: repeated.at(-1)!.end },
          confidence,
          message: `${repeated.length} sentences reuse the same grammatical frame and similar cadence. Vary the construction or combine claims that are doing the same job.`,
        });
      },
    };
  },
});
