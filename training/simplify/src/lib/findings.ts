// One definition of "how much lint is in this text", shared by the training
// scorer, the fix workflow, and the eval harness.
//
// Findings used to be filtered to error and warn before anything counted them.
// That made every info finding worth zero, so the model was never paid to
// remove a habit slopsift grades as a review candidate — `corrective-antithesis`
// ("X, not Y") is the case that exposed it. Weighting instead of filtering lets
// info apply real pressure at a lower price, and keeps the reward continuous so
// partial progress still moves the score.

import type { LevelWeights } from './env.ts';

export interface LeveledFinding {
  level: string;
}

/** slopsift's own name for the middle level is `warn`, not `warning`. */
export function weightFor(level: string, weights: LevelWeights): number {
  if (level === 'error') return weights.error;
  if (level === 'warn' || level === 'warning') return weights.warn;
  if (level === 'info') return weights.info;
  return 0;
}

/** Weighted finding count, used by the reward and the eval harness.
 *
 * The fixer loop deliberately still counts paid findings only: it exits at zero
 * paid findings, and pricing info there without moving that bar would spend
 * budget on a target nothing checks. See `runChatFixer` and `fix.ts`. */
export function weighFindings(findings: readonly LeveledFinding[], weights: LevelWeights): number {
  let total = 0;
  for (const finding of findings) total += weightFor(finding.level, weights);
  return total;
}

/** Counts per level, for reporting. Weighting hides how the total was reached,
 * and a run that trades ten info findings for one error should be visible. */
export function countByLevel(findings: readonly LeveledFinding[]): { error: number; warn: number; info: number } {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const finding of findings) {
    if (finding.level === 'error') counts.error += 1;
    else if (finding.level === 'warn' || finding.level === 'warning') counts.warn += 1;
    else if (finding.level === 'info') counts.info += 1;
  }
  return counts;
}
