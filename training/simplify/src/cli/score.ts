import { createHash } from 'node:crypto';

import { loadConfig } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
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

/** Weighted by the reward's rule set. Every configured rulepack still runs;
 * `scoredRules` decides what gets PRICED, not what gets looked at. */
async function lintMany(texts: Map<string, string>): Promise<Map<string, number>> {
  const findings = await lintTexts(texts, config);
  const counts = new Map<string, number>();
  for (const [key, messages] of findings) {
    counts.set(key, weighFindings(messages, config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules));
  }
  return counts;
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
