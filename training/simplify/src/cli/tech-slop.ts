// Builds the AI-voiced half of the technical pair corpus.
//
//   npx tsx src/cli/tech-slop.ts --limit 10          # smoke test
//   npx tsx src/cli/tech-slop.ts                     # the full 561
//
// Inputs are human pull request descriptions merged before GPT-3 existed, so a
// target the model imitates is known to be written by a person. Outputs go to
// runs/docs-2018-slop and pair back to runs/docs-2018 by filename.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { FileStorage, createEngine } from '@nikhilverma/durably';

import { durablyDir, runsDir, simplifyRoot } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { rewriteTechDocs, type SlopJob } from '../workflows/tech-slop.ts';

const { values } = parseArgs({
  options: {
    inputDir: { type: 'string', default: 'runs/docs-2018' },
    outputDir: { type: 'string', default: 'runs/docs-2018-slop' },
    /** One model per document rather than every model on every document. Three
     * voices keep the corpus from learning one vendor's tics, and rotating
     * rather than multiplying keeps the technical share of the corpus from
     * swamping the essay share. */
    models: {
      type: 'string',
      default: 'anthropic/claude-sonnet-5,google/gemini-3.7-flash,openai/gpt-5.6-luna',
    },
    limit: { type: 'string', default: '0' },
    concurrency: { type: 'string', default: '6' },
    maxTokens: { type: 'string', default: '8000' },
  },
});

const inputDir = path.resolve(simplifyRoot, values.inputDir as string);
const outputDir = path.resolve(simplifyRoot, values.outputDir as string);
const models = (values.models as string).split(',').map((m) => m.trim()).filter(Boolean);

let names = readdirSync(inputDir).filter((f) => f.endsWith('.md')).sort();
const limit = Number(values.limit);
if (limit > 0) names = names.slice(0, limit);

const jobs: SlopJob[] = names.map((name, i) => ({
  name,
  model: models[i % models.length],
  inputDir,
  outputDir,
}));

const engine = createEngine({
  storage: new FileStorage(durablyDir),
  concurrency: 2,
  checkpointEvery: 1,
}) as ReturnType<typeof createEngine> & {
  runDirectFast: (wf: unknown, input: unknown, opts: object) => Promise<unknown>;
};

const before = totalSpentUsd();
console.error(`${jobs.length} documents over ${models.length} models; spent so far $${before.toFixed(2)}`);

const result = await engine.runDirectFast(
  rewriteTechDocs,
  { jobs, maxTokens: Number(values.maxTokens), concurrency: Number(values.concurrency) },
  { key: `tech-slop-${path.basename(outputDir)}-${jobs.length}` },
);

console.log(JSON.stringify(result, null, 2));
console.error(`spent now $${totalSpentUsd().toFixed(2)} (this run $${(totalSpentUsd() - before).toFixed(2)})`);
console.error(`outputs in ${path.relative(simplifyRoot, outputDir)}`);
