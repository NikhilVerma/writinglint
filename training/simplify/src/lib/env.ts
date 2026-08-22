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

/** One domain's targets. See `domains` below for how they were measured. */
export interface DomainConfig {
  band: [number, number];
  echoFloor: number;
}

/** Weights and thresholds for the GRPO reward. Tunable without a code change
 * so a training run can be re-weighted from config.json alone. */
export interface RewardConfig {
  /** Split between the two terms a faithful rewrite competes on. Faithfulness
   * and echo are gates rather than terms, so they carry no weight here. */
  weights: { lint: number; length: number };
  /** How hard echo scales the other terms. At 1 a verbatim copy earns zero. */
  echoStrength: number;
  /** Subtracted from the faithfulness term per invented anchor. */
  inventedPenalty: number;
  /** Output-to-input word ratio that earns the full length term. */
  lengthBand: [number, number];
  /** Per-domain targets. Essays and technical documents are different kinds of
   * writing and a single set of numbers cannot serve both.
   *
   * `band` is weighted findings per 1k that count as human-level, taken from
   * p10 and p75 of untouched human originals in that domain: 250 blog essays
   * give [7, 15], and 561 pull requests merged between 2018 and 2019 give
   * [2.5, 16.8]. A rewrite landing inside scores full marks on the lint term,
   * so already-clean text can be handed back unchanged.
   *
   * The merge window is the whole point of the technical figure. It was first
   * measured on CURRENT pull requests and came out at [3, 23], and that was
   * contamination: 24 of those 639 documents say "Generated with [Claude Code]"
   * in the body, 12 name Copilot, 48 carry GitHub's generative-AI disclosure
   * prompt, and the undeclared share cannot be known. Re-measured on prose
   * merged before GPT-3 existed, every percentile drops and the technical
   * median lands BELOW the essay median. Technical writing is not sloppier
   * than essay writing; the corpus was.
   *
   * `echoFloor` is the share of source 4-grams a rewrite may keep before the
   * anti-copy gate starts charging. It is measured the same way, from what a
   * legitimate rewrite in that domain actually echoes: essays 0.11 at the
   * median, technical text 0.74, because names and numbers have to survive.
   *
   * See the domain split and the lint term in reward.ts. */
  domains: { prose: DomainConfig; technical: DomainConfig };
  /** Anchors per 100 words at or above which a document is scored as technical.
   * Essays reach 3.5 at the 95th percentile and 98% of technical documents
   * clear 4, so the threshold sits in a wide empty gap. */
  technicalAnchorsPer100Words: number;
  /** Floor on the denominator of the lint term, so a source sitting one finding
   * above the band does not make that term all-or-nothing across one finding. */
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
