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
  const [bandLow, bandHigh] = config.humanBand;
  let lint: number;
  if (outPer1k > bandHigh) {
    // A source that starts just above the band would otherwise make the term
    // all-or-nothing across a one-finding gap, so the run-up is at least
    // `lintSpan` wide.
    const start = Math.max(srcPer1k, bandHigh + config.lintSpan);
    lint = clamp((start - outPer1k) / (start - bandHigh));
  } else if (outPer1k >= bandLow) {
    lint = 1;
  } else {
    lint = clamp(1 - config.belowBandPenalty * ((bandLow - outPer1k) / bandLow));
  }

  // Echo: full marks at or below the floor, falling to zero at a verbatim copy.
  const echoTerm = clamp(1 - (echo - config.echoFloor) / (1 - config.echoFloor));

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
    words,
    lengthRatio: Math.round(lengthRatio * 1e4) / 1e4,
  };
}
