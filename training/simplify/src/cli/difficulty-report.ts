// Is the training set drawn from the same documents the benchmark grades on?
//
//   npx tsx src/cli/difficulty-report.ts
//
// A rewriter is only ever asked to clean a document that needs cleaning, so the
// dirty half of the benchmark is the half that decides whether the model is
// worth shipping. If the training set is mostly documents that were already
// close to the band, the model spends its gradient learning to polish text that
// was already fine and never sees the job it is graded on.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    train: { type: 'string', default: 'train/data/v14/train.jsonl' },
    bench: { type: 'string', default: 'qwen8' },
    chunk: { type: 'string', default: '40' },
  },
});

const config = loadConfig();
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);

async function profile(label: string, sources: string[]) {
  const out: { d: 'prose' | 'technical'; s: number }[] = [];
  const chunk = Number(values.chunk);
  for (let i = 0; i < sources.length; i += chunk) {
    const batch = sources.slice(i, i + chunk);
    const texts = new Map<string, string>();
    batch.forEach((s, j) => texts.set(`s-${i + j}`, s));
    const f = await lintTexts(texts, config);
    batch.forEach((s, j) => {
      const w = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
      const terms = scoreRewrite({ source: s, output: s, sourceFindings: w, outputFindings: w, config: config.reward });
      out.push({ d: terms.domain, s: terms.sourceFindingsPer1kWords });
    });
  }
  console.log(`\n${label}  n=${out.length}`);
  for (const d of ['prose', 'technical'] as const) {
    const g = out.filter((o) => o.d === d);
    if (g.length === 0) continue;
    const dirty = g.filter((o) => o.s > config.reward.domains[d].band[1]);
    console.log(
      `  ${d.padEnd(10)} n=${String(g.length).padEnd(5)} mean source ${mean(g.map((o) => o.s)).toFixed(1)}/1k` +
        `   needs work ${((100 * dirty.length) / g.length).toFixed(0)}%   (those average ${mean(dirty.map((o) => o.s)).toFixed(1)}/1k)`,
    );
  }
}

const train = readFileSync(values.train as string, 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => (JSON.parse(l).messages as { content: string }[])[1].content.split('Simplify this:\n\n')[1] ?? '');

// The benchmark draws each document about 2.5 times; profile each one once.
const seen = new Set<string>();
const benchSources: string[] = [];
for (const line of readFileSync(path.join(runsDir, `drift-${values.bench as string}.jsonl`), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { id: string; passes: string[] };
  if (seen.has(row.id)) continue;
  seen.add(row.id);
  benchSources.push(row.passes[0]);
}

await profile(`training sources (${values.train})`, train);
await profile(`benchmark sources (${values.bench})`, benchSources);
