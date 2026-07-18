import { defineRule } from 'writinglint-core';

const MIN_SENTENCES = 8;
const MAX_CV = 0.22;
const RUN_BAND = 0.25;

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
        if (doc.sentences.length < MIN_SENTENCES) return;
        const lengths = doc.sentences.map((sentence) => sentence.words.length).filter(Boolean);
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
        const anchor = doc.sentences[bestStart]!;
        ctx.report({
          span: { start: anchor.start, end: anchor.end },
          confidence: 'low',
          message: `Uniform sentence rhythm: ${lengths.length} sentences average about ${Math.round(mean)} words with little variation. Break the cadence with a shorter or longer sentence.`,
        });
      },
    };
  },
});
