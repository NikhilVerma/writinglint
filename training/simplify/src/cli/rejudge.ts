import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { appendJsonl, readJsonl, trialFile } from '../lib/store.ts';
import { judgeOne, type JudgeVerdict } from '../workflows/fix.ts';

// Re-judges human-review pairs with the current judge panel and rubric,
// deciding by majority. Skips pairs the human already ruled on
// (human-verdicts.jsonl) and pairs already re-judged, so re-running resumes.

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
  },
});

if (!values.trial) {
  console.error('usage: tsx rejudge.ts --trial <name> [--concurrency N]');
  process.exit(2);
}
const trial = values.trial as string;
const config = loadConfig();

interface ReviewRecord {
  sourceId: string;
  original: string;
  rewrite: string | null;
  generatorModel: string | null;
  fixerModel: string;
}

const records = readJsonl<ReviewRecord>(trialFile(trial, 'human-review.jsonl'));
const ruled = new Set(readJsonl<{ sourceId: string }>(trialFile(trial, 'human-verdicts.jsonl')).map((r) => r.sourceId));
const done = new Set(readJsonl<{ sourceId: string }>(trialFile(trial, 'rejudge.jsonl')).map((r) => r.sourceId));
const pending = records.filter((r) => r.rewrite !== null && !ruled.has(r.sourceId) && !done.has(r.sourceId));

console.log(`rejudging ${pending.length} of ${records.length} pairs with [${config.judgeModels.join(', ')}] under ${config.judgePromptVersion}`);
console.log(`ledger: $${totalSpentUsd().toFixed(4)} of $${config.capUsd}`);

async function rejudgeOne(rec: ReviewRecord): Promise<void> {
  const verdicts: JudgeVerdict[] = await Promise.all(
    config.judgeModels.map((model) => judgeOne(model, rec.original, rec.rewrite as string, trial)),
  );
  const passes = verdicts.filter((v) => v.response.verdict === 'pass').length;
  const outcome = passes * 2 > verdicts.length ? 'accepted' : passes * 2 === verdicts.length ? 'human-review' : 'dropped';
  appendJsonl(trialFile(trial, 'rejudge.jsonl'), {
    ts: new Date().toISOString(),
    trial,
    sourceId: rec.sourceId,
    generatorModel: rec.generatorModel,
    fixerModel: rec.fixerModel,
    judgePromptVersion: config.judgePromptVersion,
    passes,
    outcome,
    costUsd: verdicts.reduce((sum, v) => sum + v.costUsd, 0),
    judges: verdicts,
  });
  console.log(`  ${rec.sourceId}: ${passes}/${verdicts.length} pass -> ${outcome}`);
}

const queue = [...pending];
const workers = Array.from({ length: Number(values.concurrency) }, async () => {
  for (let rec = queue.shift(); rec !== undefined; rec = queue.shift()) {
    try {
      await rejudgeOne(rec);
    } catch (error) {
      console.error(`  ${rec.sourceId}: FAILED ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
await Promise.all(workers);

const results = readJsonl<{ outcome: string }>(trialFile(trial, 'rejudge.jsonl'));
const counts: Record<string, number> = {};
for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
console.log('rejudge totals:', JSON.stringify(counts));
console.log(`ledger after: $${totalSpentUsd().toFixed(4)}`);
