import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { scoreRewrite, type RewardTerms } from '../lib/reward.ts';
import { normalizeOutput } from '../lib/text.ts';

// Batch reward scorer. Reads {id, input, output} JSON lines on stdin and
// writes one scored line per input to stdout. The GRPO trainer shells out to
// this once per step, so slopsift stays the single source of lint truth
// instead of being reimplemented in Python.
//
//   npx tsx src/cli/score.ts < rollouts.jsonl > scored.jsonl
//
// Every text in a batch is linted in one slopsift process. Sources repeat
// across a rollout group, so they are deduplicated by content hash first.

const execFileAsync = promisify(execFile);

interface Row {
  id: string;
  input: string;
  output: string;
}

const config = loadConfig();

const stdin: string = await new Promise((resolve, reject) => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (buffer += chunk));
  process.stdin.on('end', () => resolve(buffer));
  process.stdin.on('error', reject);
});

const rows: Row[] = stdin
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as Row)
  .map((row) => ({ ...row, output: normalizeOutput(row.output) }));

if (rows.length === 0) process.exit(0);

const hash = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 16);

/** Lint every text in one slopsift process, keyed by the caller's own name. */
async function lintMany(texts: Map<string, string>): Promise<Map<string, number>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'simplify-score-'));
  try {
    const names: string[] = [];
    for (const [key, text] of texts) {
      const name = `${key}.md`;
      writeFileSync(path.join(dir, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
      names.push(name);
    }
    // `--level info` on purpose: the reward prices info findings below the two
    // paid levels rather than discarding them. Without this flag slopsift never
    // reports them, so their weight would silently be zero.
    //
    // Every configured rulepack still runs. `scoredRules` decides what gets
    // PRICED, not what gets looked at, so one lint pass serves both the reward
    // and anything that wants the full picture.
    const args = ['--format', 'json', '--level', 'info', ...config.rulepacks.flatMap((pack) => ['--rulepack', pack]), ...names];
    let stdout = '';
    try {
      ({ stdout } = await execFileAsync('slopsift', args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
    } catch (error) {
      // slopsift exits 1 when it reports errors; that is a result, not a crash.
      const failure = error as { code?: number | string; stdout?: string; message?: string };
      if (failure.code === 1 && failure.stdout) stdout = failure.stdout;
      else throw new Error(`slopsift failed (exit ${failure.code ?? '?'}): ${failure.message ?? 'unknown'}`);
    }
    const files = JSON.parse(stdout) as { filePath: string; messages: { level: string; ruleId: string }[] }[];
    const counts = new Map<string, number>();
    for (const file of files) {
      counts.set(
        path.basename(file.filePath, '.md'),
        weighFindings(file.messages, config.reward.levelWeights, config.reward.scoredRules),
      );
    }
    return counts;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const texts = new Map<string, string>();
const sourceKey = new Map<number, string>();
const outputKey = new Map<number, string>();
rows.forEach((row, i) => {
  const src = `src-${hash(row.input)}`;
  const out = `out-${i}`;
  texts.set(src, row.input);
  texts.set(out, row.output.trim() === '' ? '\n' : row.output);
  sourceKey.set(i, src);
  outputKey.set(i, out);
});

const findings = await lintMany(texts);

for (const [i, row] of rows.entries()) {
  let terms: RewardTerms;
  try {
    terms = scoreRewrite({
      source: row.input,
      output: row.output,
      sourceFindings: findings.get(sourceKey.get(i) as string) ?? 0,
      outputFindings: findings.get(outputKey.get(i) as string) ?? 0,
      config: config.reward,
    });
  } catch (error) {
    // A single unscoreable rollout must not kill the training step.
    process.stdout.write(
      `${JSON.stringify({ id: row.id, reward: 0, error: error instanceof Error ? error.message : String(error) })}\n`,
    );
    continue;
  }
  process.stdout.write(`${JSON.stringify({ id: row.id, ...terms })}\n`);
}
