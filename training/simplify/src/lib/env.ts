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
  /** Findings-per-1k floor the lint term measures against. A source already
   * below it is scored on how clean the rewrite is, not on a cut it cannot
   * make. See the lint term in reward.ts. */
  lintFloor: number;
}

export function loadConfig(): SimplifyConfig {
  return JSON.parse(readFileSync(path.join(simplifyRoot, 'config.json'), 'utf8')) as SimplifyConfig;
}
