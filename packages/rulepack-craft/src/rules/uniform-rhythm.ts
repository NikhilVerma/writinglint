/**
 * Uniform rhythm — every sentence the same length, the metronome of bad prose.
 *
 * Gary Provost's principle: "This sentence has five words. Here are five more
 * words. Five-word sentences are fine. But several together become monotonous.
 * … Now listen. I vary the sentence length, and I create music." Human writing
 * ebbs: short punches between long, winding sentences. Machine-flavoured (and
 * just plain flat) prose holds one length throughout.
 *
 * Detection is document-level: the coefficient of variation (sd/mean) of
 * per-sentence content-word counts. Thresholds picked empirically on the
 * private eval corpus — cv < 0.2 flags ~0.6% of human docs vs ~6% of AI docs,
 * so this errs heavily against accusing a writer with a working ear. The
 * report anchors on the longest run of near-mean sentences so the writer
 * knows where the drone is strongest.
 */
import { defineRule } from "writinglint-core";

const MIN_SENTENCES = 8;
const MAX_CV = 0.2;
/** A sentence is "on the beat" when within ±25% of the document mean. */
const RUN_BAND = 0.25;

export const uniformRhythm = defineRule({
    meta: {
        name: "uniform-rhythm",
        category: "rhythm",
        docs: { description: "Metronome prose — every sentence near the same length. Vary the rhythm." }
    },
    create(ctx) {
        return {
            Document(doc) {
                if (doc.sentences.length < MIN_SENTENCES) return;
                const lens = doc.sentences.map((s) => s.words.length);
                const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
                if (mean <= 0) return;
                const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
                if (sd / mean >= MAX_CV) return;

                // Longest run of consecutive on-the-beat sentences — the drone's core.
                let best = { start: 0, len: 0 };
                let runStart = 0;
                for (let i = 0; i <= lens.length; i++) {
                    const onBeat = i < lens.length && Math.abs(lens[i] - mean) <= RUN_BAND * mean;
                    if (!onBeat) {
                        if (i - runStart > best.len) best = { start: runStart, len: i - runStart };
                        runStart = i + 1;
                    }
                }
                const anchor = doc.sentences[best.start];
                ctx.report({
                    span: { start: anchor.start, end: anchor.end },
                    message:
                        `Metronome rhythm: ${doc.sentences.length} sentences averaging ~${Math.round(mean)} words ` +
                        `with almost no variation (${best.len} in a row near the mean, starting here). ` +
                        "Vary the rhythm — drop in a short punch, let one sentence wind. Uniform lengths read as a drone."
                });
            }
        };
    }
});
