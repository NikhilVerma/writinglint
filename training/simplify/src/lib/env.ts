import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const simplifyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRoot = path.resolve(simplifyRoot, '..', '..');
const dataRoot = process.env.SIMPLIFY_DATA_DIR ?? simplifyRoot;
export const sourcesDir = path.join(dataRoot, 'sources');
export const runsDir = path.join(dataRoot, 'runs');
export const durablyDir = path.join(dataRoot, '.durably');
// Human-authored essays paired with AI rewrites. Private corpus: gitignored,
// never leaves this machine, never quoted in issues or commits.
export const corpusDir = path.join(dataRoot, 'corpus');

export const fakeLlm = process.env.SIMPLIFY_FAKE === '1';

export function loadApiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const envFile = readFileSync(path.join(repoRoot, '.env'), 'utf8');
  const match = envFile.match(/^OPENROUTER_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
  if (!match) throw new Error('OPENROUTER_API_KEY not found in environment or root .env');
  return match[1].trim();
}

export interface SimplifyConfig {
  capUsd: number;
  attemptLimit: number;
  seed: number;
  promptVersion: string;
  fixerPromptVersion: string;
  judgePromptVersion: string;
  rulepacks: string[];
  generatorModels: string[];
  judgeModels: string[];
  fixerModel: string;
  fixerChatPromptVersion: string;
  fixerChatMaxTokens: number;
  generatorMaxTokens: number;
  judgeMaxTokens: number;
  fixerMaxTurns: number;
  fixerTimeoutMs: number;
  reward: RewardConfig;
}

/** How much one finding counts toward the lint term, by slopsift level. Info
 * findings are graded as review candidates rather than defects, so they are
 * priced below the two paid levels instead of being dropped. */
export interface LevelWeights {
  error: number;
  warn: number;
  info: number;
}

/** Weights and thresholds for the GRPO reward. Tunable without a code change
 * so a training run can be re-weighted from config.json alone. */
export interface RewardConfig {
  /** Split between the two terms a faithful rewrite competes on. Faithfulness
   * and echo are gates rather than terms, so they carry no weight here. */
  weights: { lint: number; length: number };
  /** Echo at or below this scores full marks; identifier-dense text cannot
   * reach zero, so demanding it would reward dropping facts. */
  echoFloor: number;
  /** How hard echo scales the other terms. At 1 a verbatim copy earns zero. */
  echoStrength: number;
  /** Subtracted from the faithfulness term per invented anchor. */
  inventedPenalty: number;
  /** Output-to-input word ratio that earns the full length term. */
  lengthBand: [number, number];
  /** Weighted findings per 1k that count as human-level prose, taken from p10
   * and p75 of 1,221 untouched originals in the human-pairs corpus. A rewrite
   * landing inside scores full marks on the lint term, so already-clean text
   * can be handed back unchanged. See the lint term in reward.ts. */
  humanBand: [number, number];
  /** Narrowest run-up above the band the lint term measures across, so a source
   * starting just above it still yields a usable gradient. */
  lintSpan: number;
  /** How hard the lint term tapers below the band. At 0.5, prose with no
   * findings at all keeps half the term. Stops the model editing past the
   * humans it is meant to sound like. */
  belowBandPenalty: number;
  /** How far above the band a source must sit before the echo gate asks for a
   * full rewrite rather than a minimal edit. At the band the gate rewards
   * preservation; this many findings per 1k above it, the gate is pure
   * anti-copy; in between it blends. See the echo gate in reward.ts. */
  echoWorkSpan: number;
  /** How hard preservation is rewarded when the source needs no work. The echo
   * gate flips direction there: instead of punishing a copy it pays for one,
   * because holding finished text steady is the whole fixed-point objective.
   * At 1 a rewrite that changes a fifth of the phrasing loses a fifth of the
   * reward. See the echo gate in reward.ts. */
  stabilityStrength: number;
  /** Which rules the reward prices, as rulepack names or full rule ids. The
   * product still reports every rule; this narrows only what the rewriter is
   * paid for. See `isScoredRule` in findings.ts for the measurement behind it. */
  scoredRules: string[];
  /** Per-level price of a finding. See `weighFindings` in findings.ts. */
  levelWeights: LevelWeights;
}

export function loadConfig(): SimplifyConfig {
  return JSON.parse(readFileSync(path.join(simplifyRoot, 'config.json'), 'utf8')) as SimplifyConfig;
}
