import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { fakeLlm, loadConfig } from './env.ts';

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
  const args = ['--format', 'json', ...config.rulepacks.flatMap((pack) => ['--rulepack', pack]), 'draft.md'];
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
  return {
    errorCount: file.errorCount,
    warningCount: file.warningCount,
    findings: file.messages
      .filter((m) => m.level === 'error' || m.level === 'warn')
      .map(({ ruleId, level, message, line, column, text }) => ({ ruleId, level, message, line, column, text })),
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
    findings: dirty
      ? [{ ruleId: 'ai-style/promo-idioms', level: 'error', message: 'fake finding', line: 1, column: 1, text: 'game-changer' }]
      : [],
    slopsiftExitCode: dirty ? 1 : 0,
  };
}
