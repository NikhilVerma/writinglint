/**
 * The document-level AI-style SCORE — deliberately separate from the lints. The
 * lints say "here is a specific construction to revise"; the score says "overall,
 * how AI-shaped does the prose read". They are independent readings (a tight text
 * can score low with a few flags; a smooth one can score high with none), so the
 * score lives here as its own function, not as a rule.
 */
import type { Document, Lint } from 'writinglint-core';
import { docFeatures } from './features.js';
import { predict, type Model } from './classifier.js';
import { CATEGORY_WEIGHT } from '../categories.js';

export type { Model } from './classifier.js';
export type { DocFeatures } from './features.js';
export { docFeatures, scalarNames } from './features.js';
export { predict, trainModel, vectorize, fitVectorizer, trainLogReg } from './classifier.js';

// Verdict bands over the classifier probability (×100). The detector measures
// AI-shaped *style* (hollowness / generic rhythm), NOT authorship — tight,
// specific writing scores low whoever wrote it — so the labels describe how the
// prose reads, not who produced it.
export const VERDICTS: { max: number; label: string }[] = [
  { max: 20, label: 'Reads clean' },
  { max: 45, label: 'Mostly clean' },
  { max: 60, label: 'Some AI-style' },
  { max: 80, label: 'Noticeably AI-styled' },
  { max: 101, label: 'Reads AI-styled' },
];

export function verdict(score: number): string {
  return (VERDICTS.find((v) => score < v.max) ?? VERDICTS[VERDICTS.length - 1]).label;
}

export interface ScoreResult {
  /** 0–100 calibrated "AI-style" score. */
  score: number;
  /** Human-readable band. */
  verdict: string;
}

/**
 * Score a linted document. With a trained `model`, the score is the calibrated
 * classifier probability ×100 (the SOTA detector). Without one, it falls back to
 * a weighted tell-density so the app still works before a model is built.
 */
export function score(doc: Document, lints: Lint[], model?: Model): ScoreResult {
  let s: number;
  if (model) {
    s = Math.round(predict(model, docFeatures(doc, lints)) * 100);
  } else {
    let weighted = 0;
    for (const l of lints) weighted += CATEGORY_WEIGHT(l.category);
    const words = doc.tokens.length;
    const per100 = words > 0 ? (weighted / words) * 100 : 0;
    s = Math.min(100, Math.round(per100 * 6));
  }
  return { score: s, verdict: verdict(s) };
}
