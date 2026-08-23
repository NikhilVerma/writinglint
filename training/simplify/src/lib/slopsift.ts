import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { fakeLlm, loadConfig } from './env.ts';
import { countByLevel, weighFindings } from './findings.ts';

const execFileAsync = promisify(execFile);
import { readDraft, workDir } from './store.ts';

export interface LintFinding {
  ruleId: string;
  level: string;
  message: string;
  line: number;
  column: number;
  text: string;
}

export interface LintResult {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Findings priced by level. The lint term measures this, not a raw count. */
  weightedCount: number;
  findings: LintFinding[];
  slopsiftExitCode: number;
}

/**
 * Lint the trial draft with the configured rulepacks using the globally
 * installed slopsift. Async on purpose: a synchronous exec would block the
 * event loop and serialize every concurrent workflow in the engine.
 */
export async function lintDraft(trial: string, sourceId: string): Promise<LintResult> {
  if (fakeLlm) return fakeLint(trial, sourceId);
  return lintDir(workDir(trial, sourceId));
}

/** Lint draft.md inside any directory. The eval harness lints texts that
 * never went through a trial work dir, so this takes a plain cwd. */
export async function lintDir(cwd: string): Promise<LintResult> {
  const config = loadConfig();
  // slopsift reports warnings and above by default. The reward prices info
  // findings rather than discarding them, so they have to be requested.
  const args = ['--format', 'json', '--level', 'info', ...config.rulepacks.flatMap((pack) => ['--rulepack', pack]), 'draft.md'];
  let stdout = '';
  let exitCode = 0;
  try {
    ({ stdout } = await execFileAsync('slopsift', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; message?: string };
    if (failure.code === 1 && failure.stdout) {
      stdout = failure.stdout;
      exitCode = 1;
    } else {
      throw new Error(`slopsift failed (exit ${failure.code ?? '?'}): ${failure.message ?? 'unknown'}`);
    }
  }
  const files = JSON.parse(stdout) as {
    messages: { ruleId: string; level: string; message: string; line: number; column: number; text: string }[];
    errorCount: number;
    warningCount: number;
  }[];
  const file = files[0];
  if (!file) throw new Error('slopsift returned no file results for draft.md');
  const findings = file.messages.map(({ ruleId, level, message, line, column, text }) => ({
    ruleId,
    level,
    message,
    line,
    column,
    text,
  }));
  const counts = countByLevel(findings);
  return {
    errorCount: counts.error,
    warningCount: counts.warn,
    infoCount: counts.info,
    // Priced by the reward's rule set, matching score.ts. `findings` below is
    // deliberately unfiltered: the reward measures a narrow question, reporting
    // shows everything.
    weightedCount: weighFindings(findings, config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules),
    findings,
    slopsiftExitCode: exitCode,
  };
}

export function slopsiftVersion(): string {
  if (fakeLlm) return 'fake';
  return execFileSync('slopsift', ['--version'], { encoding: 'utf8' }).trim();
}

/** Fake mode: dirty until the fake fixer has rewritten the draft. */
function fakeLint(trial: string, sourceId: string): LintResult {
  const dirty = readDraft(trial, sourceId).includes('game-changer');
  return {
    errorCount: dirty ? 1 : 0,
    warningCount: 0,
    infoCount: 0,
    weightedCount: dirty ? 1 : 0,
    findings: dirty
      ? [{ ruleId: 'ai-style/promo-idioms', level: 'error', message: 'fake finding', line: 1, column: 1, text: 'game-changer' }]
      : [],
    slopsiftExitCode: dirty ? 1 : 0,
  };
}
