import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import type { Lint } from 'writinglint-core';
import type { LintSourceOptions, SlopSiftResult } from './index.js';
import { makeResult, type Result } from './format.js';

interface LintEngine {
  lintSource(filePath: string, source: string, options: LintSourceOptions): Promise<SlopSiftResult | undefined>;
}

export interface LintFilesOptions {
  level: NonNullable<LintSourceOptions['level']>;
  rulepacks?: readonly NonNullable<LintSourceOptions['rulepacks']>[number][];
  technicalMode?: NonNullable<LintSourceOptions['technicalMode']>;
  explicitlySelectedFiles: ReadonlySet<string>;
  cwd?: string;
  readSource?: (filePath: string) => Promise<string>;
}

export interface LintFilesResult {
  results: Result[];
  runtimeFailures: number;
}

function displayPath(file: string, cwd: string): string {
  const local = relative(cwd, file);
  return local === '..' || local.startsWith(`..${sep}`) ? file : (local || file);
}

/** Lint every selected file, retaining structured failures and later results. */
export async function lintFiles(
  engine: LintEngine,
  files: readonly string[],
  options: LintFilesOptions,
): Promise<LintFilesResult> {
  const results: Result[] = [];
  let runtimeFailures = 0;
  const cwd = options.cwd ?? process.cwd();
  const readSource = options.readSource ?? ((file: string) => readFile(file, 'utf8'));

  for (const file of files) {
    const label = displayPath(file, cwd);
    let source = '';
    try {
      source = await readSource(file);
      const report = await engine.lintSource(file, source, {
        level: options.level,
        reportEmpty: options.explicitlySelectedFiles.has(file),
        rulepacks: options.rulepacks,
        technicalMode: options.technicalMode,
      });
      if (report) results.push(makeResult(
        label,
        source,
        report.lints,
        report.wordCount,
        report.standardAssessment,
      ));
    } catch (error) {
      runtimeFailures++;
      const message = error instanceof Error ? error.message : String(error);
      const lint: Lint = {
        ruleId: 'slopsift/runtime-error',
        category: 'diagnostic',
        severity: 'error',
        confidence: 'high',
        start: 0,
        end: 0,
        text: '',
        message: `SlopSift could not analyze this file: ${message}`,
      };
      results.push(makeResult(label, source, [lint], 0));
    }
  }

  return { results, runtimeFailures };
}
