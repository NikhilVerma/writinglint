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
  ruleId?: string;
}

/** Whether a finding counts toward the reward.
 *
 * The reward and the product measure different things. slopsift reports every
 * rule to users, and should. The reward has to measure one narrow question —
 * does this read as AI-written — and most of `reader-first` cannot answer it.
 * Measured over 250 paired documents, the whole pack scored -0.32 ± 0.72
 * findings per 1k on the sloppified side against the human original it was
 * made from: it fires marginally HARDER on the humans. `sentence-load` alone
 * was a third of all findings at 12.9 per 1k against 13.2. The cheapest way to
 * cut that is to chop sentences, which is what the reward was really paying
 * for, and it is why v7 cuts 29% of the words and never reaches a stable point.
 *
 * Entries are a rulepack name or a full rule id. An empty list scores
 * everything, which is what the non-reward callers want. */
export function isScoredRule(ruleId: string | undefined, scored: readonly string[]): boolean {
  if (scored.length === 0 || ruleId === undefined) return true;
  return scored.includes(ruleId) || scored.includes(ruleId.split('/')[0]);
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
export function weighFindings(
  findings: readonly LeveledFinding[],
  weights: LevelWeights,
  scoredRules: readonly string[] = [],
): number {
  let total = 0;
  for (const finding of findings) {
    if (isScoredRule(finding.ruleId, scoredRules)) total += weightFor(finding.level, weights);
  }
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
