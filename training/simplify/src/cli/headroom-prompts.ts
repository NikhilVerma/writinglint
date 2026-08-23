// How much better is the model's best sample than its average one, on the
// documents it is actually graded on?
//
//   npx tsx src/cli/headroom-prompts.ts --out headroom-prompts
//
// This decides the whole strategy and nothing else can. Self-distillation can
// only ever teach a model to hit its own best-of-n. If the best of eight tries
// on the benchmark's hard prose is far above the average try, the lesson exists
// and the training set is what is wrong. If it is not, no amount of resampling
// this model will help and the repairs have to come from somewhere better.
//
// These documents are BENCHMARK inputs. They are sampled here to measure a
// ceiling and must never become training data.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, runsDir } from '../lib/env.ts';
import { weighFindings } from '../lib/findings.ts';
import { lintTexts } from '../lib/lint-batch.ts';
import { scoreRewrite } from '../lib/reward.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'drift-inputs-v11' },
    prompt: { type: 'string', default: 'prompts/rewrite-sft-v3.md' },
    out: { type: 'string', default: 'headroom-prompts' },
    domain: { type: 'string', default: 'prose' },
  },
});

const config = loadConfig();

// One row per document: the benchmark draws each of them about 2.5 times.
const seen = new Set<string>();
const docs: { id: string; source: string }[] = [];
for (const line of readFileSync(path.join(runsDir, `${values.in as string}.jsonl`), 'utf8').split('\n')) {
  if (line.trim() === '') continue;
  const row = JSON.parse(line) as { id: string; input: string };
  if (seen.has(row.id)) continue;
  seen.add(row.id);
  docs.push({ id: row.id, source: row.input });
}

const system = readFileSync(values.prompt as string, 'utf8');
const out: string[] = [];
let skipped = 0;
for (let i = 0; i < docs.length; i += 40) {
  const batch = docs.slice(i, i + 40);
  const texts = new Map<string, string>();
  batch.forEach((d, j) => texts.set(`s-${i + j}`, d.source));
  const f = await lintTexts(texts, config);
  batch.forEach((d, j) => {
    const w = weighFindings(f.get(`s-${i + j}`) ?? [], config.reward.levelWeights, config.reward.scoredRules, config.reward.unscoredRules);
    const t = scoreRewrite({ source: d.source, output: d.source, sourceFindings: w, outputFindings: w, config: config.reward });
    // Only the half that needs work. A document already in band has no ceiling
    // to measure: handing it back untouched is the right answer.
    if (t.domain !== values.domain || t.sourceFindingsPer1kWords <= config.reward.domains[t.domain].band[1]) {
      skipped += 1;
      return;
    }
    out.push(
      JSON.stringify({
        id: d.id,
        source: d.source,
        prompt: [
          { role: 'system', content: system },
          { role: 'user', content: `Simplify this:\n\n${d.source}` },
        ],
      }),
    );
  });
}

const file = path.join(runsDir, `${values.out as string}.jsonl`);
writeFileSync(file, `${out.join('\n')}\n`);
console.log(`wrote ${out.length} ${values.domain} documents that need work to ${file} (${skipped} skipped)`);
