// The GRPO reward. Four terms, each in [0, 1], combined by the weights in
// config.json. Faithfulness carries the most weight on purpose: punishing the
// copy habit pushes a small model toward inventing facts instead, and that
// failure is much harder to spot than a verbatim rewrite.

import type { RewardConfig } from './env.ts';
import { echoRate, faithfulness, vocabularyOverlap } from './faithfulness.ts';
import { maxRepetitionRatio, minProseRatio, proseRatio, repetitionRatio } from './text.ts';

export interface RewardTerms {
  reward: number;
  lint: number;
  echo: number;
  faithfulness: number;
  length: number;
  /** Set when the output is unusable, which zeroes the reward outright. */
  degenerate: string | null;
  echoRate: number;
  vocabularyOverlap: number;
  anchorKeptRate: number;
  inventedAnchors: number;
  droppedAnchors: string[];
  findingsPer1kWords: number;
  sourceFindingsPer1kWords: number;
  /** Which band and echo floor this document was scored against. */
  domain: 'prose' | 'technical';
  anchorsPer100Words: number;
  words: number;
  lengthRatio: number;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}

export function findingsPer1kWords(findings: number, words: number): number {
  return (findings * 1000) / Math.max(words, 1);
}

/**
 * A rewrite is scored against its own source, not against a fixed target, so
 * that inputs of differing quality stay comparable.
 */
export function scoreRewrite(args: {
  source: string;
  output: string;
  sourceFindings: number;
  outputFindings: number;
  config: RewardConfig;
}): RewardTerms {
  const { source, output, sourceFindings, outputFindings, config } = args;
  const words = wordCount(output);
  const sourceWords = wordCount(source);
  const lengthRatio = words / Math.max(sourceWords, 1);

  const outPer1k = findingsPer1kWords(outputFindings, words);
  const srcPer1k = findingsPer1kWords(sourceFindings, sourceWords);
  const anchors = faithfulness(source, output);
  const echo = echoRate(source, output);

  // Which kind of writing this is, decided by anchor density and nothing else.
  //
  // One band cannot serve both. A single [7, 15] was measured on 250 blog
  // essays and then enforced on release notes and pull-request descriptions,
  // which sit at a median of 16.4 weighted findings per 1k in the same units.
  // Ordinary human technical prose was being told it was slop.
  //
  // The echo floor was mis-set in both directions by the same mistake. A
  // legitimate essay rewrite echoes a median 0.11 of its source, so a floor of
  // 0.35 handed full anti-copy credit to a rewrite doing half the work. A
  // legitimate technical rewrite echoes 0.74, because names and numbers have
  // to survive, so the same floor charged a faithful one 60% of its credit.
  //
  // Anchors per 100 words separates the two cleanly: essays reach 3.5 at the
  // 95th percentile, technical documents sit at 13.1 at the median, and 98% of
  // them clear 4. The gap is wide enough that the threshold is not delicate.
  const anchorsPer100 = (100 * anchors.anchorCount) / Math.max(sourceWords, 1);
  const technical = anchorsPer100 >= config.technicalAnchorsPer100Words;
  const domain = technical ? config.domains.technical : config.domains.prose;
  const vocabulary = vocabularyOverlap(source, output);

  // Lint: how close the rewrite lands to the way people actually write.
  //
  // This used to score the cut against a floor, which paid all the way down to
  // zero findings and never stopped. Measuring 1,221 untouched human originals
  // (the human-pairs corpus) showed
  // where that leads: they sit at 30.8 weighted findings per 1k at the median,
  // and v7 was writing at 20.4. The model had trained past the humans it was
  // supposed to sound like and kept going, because nothing above zero was ever
  // good enough.
  //
  // So the target is a band taken from that measurement, p10 to p75 of real
  // human prose. Inside it the rewrite is done and scores full marks, which is
  // what finally lets the model hand back clean text unchanged. Above it, the
  // score tracks the distance closed toward the band. Below it, the score
  // tapers, because prose cleaner than 90% of measured human writing has had something
  // taken out of it.
  const [bandLow, bandHigh] = domain.band;
  let lint: number;
  if (outPer1k > bandHigh) {
    // Still above the band: score the distance actually closed, out of the
    // distance there was to close.
    //
    // This used to measure from an inflated starting point rather than from the
    // source, and the inflation was pure profit for doing nothing. On the drift
    // benchmark, whose sources average 16.2 per 1k against a band top of 15, a
    // VERBATIM COPY scored 0.70 on this term and 0.631 overall — twice what
    // either trained model earned. A stage-2 run on that reward would have
    // learned to hand the input straight back. Now the numerator is the cut, so
    // a copy closes nothing and scores nothing.
    //
    // `lintSpan` survives as a floor on the denominator only. Without it a
    // source one finding above the band makes this term all-or-nothing across
    // that one finding.
    lint = clamp((srcPer1k - outPer1k) / Math.max(srcPer1k - bandHigh, config.lintSpan));
  } else if (outPer1k >= bandLow) {
    lint = 1;
  } else {
    // The floor drops to meet a source that already sits below the band.
    //
    // A model handed thin prose cannot be asked to fatten it back up: the only
    // way to raise findings per 1k is to put slop in. With a fixed floor, a
    // source at 10 per 1k scored 0.79 for being returned untouched and 1.00 for
    // being pushed back up to 17, so the reward paid for damage. That never
    // fired while every prompt was slop, and it fires on every prompt once the
    // model's own output is a prompt. So holding steady is full marks, and only
    // cutting further costs.
    const floor = Math.min(bandLow, srcPer1k);
    lint = floor <= 0 ? 1 : clamp(1 - config.belowBandPenalty * ((floor - outPer1k) / floor));
  }

  // Echo, in one of two directions depending on whether the source needs work.
  //
  // Above the band there is work to do, and the gate stops the model copying
  // its way out of it: full marks at or below the floor, zero at a verbatim
  // copy.
  //
  // At or below the band the job is already done, and the gate flips. Merely
  // exempting a clean source was not enough. Scoring v7's own outputs against
  // themselves, a verbatim copy beat an 11%-churned rewrite on 35% of
  // documents with a median reward gap of exactly zero — the two are the same
  // score, so a GRPO group of rollouts on finished text has no advantage
  // between them and teaches nothing. The signal was there and the reward was
  // discarding it: echoRate reads 1.000 for a copy against 0.891 for the
  // churn. So preservation is paid for directly.
  //
  // Note this reads the SOURCE, not the output, in both branches: a model
  // cannot earn the flip by scrubbing dirty text until it looks clean.
  //
  // The two directions are blended by how much work the source actually needs,
  // rather than switched on a hard edge at the band. The edge ranked the wrong
  // model first: measured over 155 documents whose sources average 16.2 per 1k
  // — barely above a band top of 15 — it paid v7 more for rewriting 72% of the
  // text than v9 for landing closer to human density, more faithfully, without
  // cutting a third of the words. "Barely above the band" and "filthy" were
  // being asked for the same amount of rewriting.
  //
  // So a source one finding above the band is treated almost like finished
  // text, and only one well clear of it is asked for a full rewrite. What this
  // buys is the minimal edit that reaches the band, which is the same thing as
  // a fixed point: change what needs changing and leave the rest alone.
  const work = clamp((srcPer1k - bandHigh) / config.echoWorkSpan);
  const antiCopy = domain.echoFloor >= 1 ? 0 : clamp(1 - (echo - domain.echoFloor) / (1 - domain.echoFloor));
  const stability = clamp(1 - config.stabilityStrength * (1 - echo));
  const echoTerm = work * antiCopy + (1 - work) * stability;

  const faithTerm = clamp(anchors.keptRate - config.inventedPenalty * anchors.inventedCount);

  const [low, high] = config.lengthBand;
  const lengthTerm = lengthRatio >= low && lengthRatio <= high
    ? 1
    : clamp(1 - (lengthRatio < low ? (low - lengthRatio) / low : (lengthRatio - high) / high));

  let degenerate: string | null = null;
  if (words < 20) degenerate = 'too short';
  else if (repetitionRatio(output) > maxRepetitionRatio) degenerate = 'repetition loop';
  else if (proseRatio(output) < minProseRatio) degenerate = 'not prose';
  // Nearly every word reused but almost no phrase: the words were reordered
  // rather than rewritten. Word salad otherwise scores well here, because it
  // keeps every anchor, echoes nothing, and holds the source's length.
  else if (vocabulary >= 0.85 && echo <= 0.05) degenerate = 'shuffled';

  // Faithfulness and echo gate the reward instead of joining it as terms.
  // As terms they can be bought: a copy is perfectly faithful and perfectly
  // sized, and a confabulation lints perfectly clean, so either one banks most
  // of the weight while failing the job. As gates, a rewrite earns credit for
  // cutting findings only while it stays true and stays out of copy territory.
  const w = config.weights;
  const quality = (w.lint * lint + w.length * lengthTerm) / (w.lint + w.length);
  const echoGate = 1 - config.echoStrength * (1 - echoTerm);
  const reward = degenerate ? 0 : faithTerm * echoGate * quality;

  return {
    reward: Math.round(reward * 1e4) / 1e4,
    lint: Math.round(lint * 1e4) / 1e4,
    echo: Math.round(echoTerm * 1e4) / 1e4,
    faithfulness: Math.round(faithTerm * 1e4) / 1e4,
    length: Math.round(lengthTerm * 1e4) / 1e4,
    degenerate,
    echoRate: Math.round(echo * 1e4) / 1e4,
    vocabularyOverlap: Math.round(vocabulary * 1e4) / 1e4,
    anchorKeptRate: Math.round(anchors.keptRate * 1e4) / 1e4,
    inventedAnchors: anchors.inventedCount,
    droppedAnchors: anchors.droppedSample,
    findingsPer1kWords: Math.round(outPer1k * 1e3) / 1e3,
    sourceFindingsPer1kWords: Math.round(srcPer1k * 1e3) / 1e3,
    domain: technical ? 'technical' : 'prose',
    anchorsPer100Words: Math.round(anchorsPer100 * 1e2) / 1e2,
    words,
    lengthRatio: Math.round(lengthRatio * 1e4) / 1e4,
  };
}
