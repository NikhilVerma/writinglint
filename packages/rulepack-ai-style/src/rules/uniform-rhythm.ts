import { defineRule } from 'writinglint-core';

const MIN_SENTENCES = 8;
const MAX_CV = 0.22;
const RUN_BAND = 0.25;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/m;

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return Infinity;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return deviation / mean;
}

/** Document-level metronome: many sentences clustering around one length. */
export const uniformRhythm = defineRule({
  meta: {
    name: 'uniform-rhythm',
    category: 'rhythm',
    docs: { description: 'Sentence lengths cluster tightly enough to produce a machine-like drone.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const proseParagraphs = doc.paragraphs.filter((paragraph) =>
          paragraph.sentences.length >= 2
          && paragraph.sentences.length <= 3
          && !LIST_ITEM_RE.test(paragraph.text));
        for (const sentenceCount of [2, 3]) {
          const sameShape = proseParagraphs.filter((paragraph) => paragraph.sentences.length === sentenceCount);
          if (sameShape.length < 4) continue;
          const slotVariation = Array.from({ length: sentenceCount }, (_, slot) =>
            coefficientOfVariation(sameShape.map((paragraph) => paragraph.sentences[slot]!.words.length)));
          if (slotVariation.some((variation) => variation > 0.28)) continue;
          const strong = slotVariation.every((variation) => variation <= 0.18);
          const anchor = sameShape[0]!;
          ctx.report({
            span: { start: anchor.start, end: anchor.end },
            confidence: strong ? 'medium' : 'low',
            message: `${sameShape.length} paragraphs repeat the same ${sentenceCount}-sentence length pattern. The alternating cadence makes the sections feel filled from one template.`,
          });
          return;
        }

        const proseSentences = doc.paragraphs
          .filter((paragraph) => !LIST_ITEM_RE.test(paragraph.text))
          .flatMap((paragraph) => paragraph.sentences);
        if (proseSentences.length < MIN_SENTENCES) return;
        const lengths = proseSentences.map((sentence) => sentence.words.length).filter(Boolean);
        if (lengths.length < MIN_SENTENCES) return;
        const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
        const deviation = Math.sqrt(lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length);
        if (deviation / mean >= MAX_CV) return;

        let bestStart = 0;
        let bestLength = 0;
        let runStart = 0;
        for (let index = 0; index <= lengths.length; index++) {
          const onBeat = index < lengths.length && Math.abs(lengths[index]! - mean) <= RUN_BAND * mean;
          if (onBeat) continue;
          if (index - runStart > bestLength) {
            bestStart = runStart;
            bestLength = index - runStart;
          }
          runStart = index + 1;
        }
        const anchor = proseSentences[bestStart]!;
        ctx.report({
          span: { start: anchor.start, end: anchor.end },
          confidence: 'low',
          message: `Uniform sentence rhythm: ${lengths.length} sentences average about ${Math.round(mean)} words with little variation. Break the cadence with a shorter or longer sentence.`,
        });
      },
    };
  },
});
