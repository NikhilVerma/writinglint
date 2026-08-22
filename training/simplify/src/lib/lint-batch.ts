// One slopsift process for a whole batch of texts.
//
// Both the reward scorer and the dataset filters need "lint these N documents
// and tell me what fired in each". Shelling out per document is what made the
// first corpus measurement take an hour; passing the file list as argv is what
// made the second one die silently at 3.4MB against ARG_MAX. This does it once,
// through a temp directory, and hands back raw findings so each caller applies
// its own weights and rule set.

import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Config } from './env.ts';
import type { LeveledFinding } from './findings.ts';

const execFileAsync = promisify(execFile);

/** Lint every text in one process, keyed by the caller's own name. */
export async function lintTexts(
  texts: Map<string, string>,
  config: Pick<Config, 'rulepacks'>,
): Promise<Map<string, LeveledFinding[]>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'simplify-lint-'));
  try {
    const names: string[] = [];
    for (const [key, text] of texts) {
      const name = `${key}.md`;
      writeFileSync(path.join(dir, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
      names.push(name);
    }
    // `--level info` on purpose: callers price info findings below the two paid
    // levels rather than discarding them. Without this flag slopsift never
    // reports them, so their weight would silently be zero.
    const args = ['--format', 'json', '--level', 'info', ...config.rulepacks.flatMap((p) => ['--rulepack', p]), ...names];
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync('slopsift', args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
    } catch (error) {
      // slopsift exits 1 when it reports errors; that is a result, not a crash.
      const failure = error as { code?: number | string; stdout?: string; message?: string };
      if (failure.code === 1 && failure.stdout) stdout = failure.stdout;
      else throw new Error(`slopsift failed (exit ${failure.code ?? '?'}): ${failure.message ?? 'unknown'}`);
    }
    const files = JSON.parse(stdout) as { filePath: string; messages: LeveledFinding[] }[];
    const out = new Map<string, LeveledFinding[]>();
    for (const file of files) out.set(path.basename(file.filePath, '.md'), file.messages);
    // A document with nothing to report is absent from slopsift's output, and
    // a caller reading `?? []` cannot tell that from a document that was never
    // linted. Fill the gaps explicitly.
    for (const key of texts.keys()) if (!out.has(key)) out.set(key, []);
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
