import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { FileStorage, createEngine } from '@nikhilverma/durably';

import { durablyDir, loadConfig, simplifyRoot, sourcesDir } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { slopsiftVersion } from '../lib/slopsift.ts';
import { settledSourceIds, sha256, trialFile, writeJsonPretty } from '../lib/store.ts';
import { fixTrial } from '../workflows/fix.ts';

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    limit: { type: 'string' },
    include: { type: 'string' },
    budget: { type: 'string', default: '50' },
    concurrency: { type: 'string', default: '4' },
  },
});

if (!values.trial) {
  console.error('usage: tsx fix.ts --trial <name> [--limit N] [--include id,id] [--budget usd]');
  process.exit(2);
}
const trial = values.trial as string;
const config = loadConfig();

// The workflow input (and run key) is the shaped source list WITHOUT the
// settled filter: a relaunch mid-trial must reproduce the original run's
// identity so durably resumes it instead of spawning a duplicate parent.
// Settled sources replay from the log for free.
let selected = readdirSync(sourcesDir)
  .filter((name) => name.startsWith('source-') && name.endsWith('.md'))
  .map((name) => name.slice('source-'.length, -'.md'.length))
  .sort();
if (values.include) {
  const wanted = new Set((values.include as string).split(','));
  selected = selected.filter((id) => wanted.has(id));
}
const limit = values.limit ? Number(values.limit) : selected.length;
selected = selected.slice(0, limit);

const settled = settledSourceIds(trial);
const pending = selected.filter((id) => !settled.has(id));

if (pending.length === 0) {
  console.log(`trial ${trial}: nothing pending (${settled.size} settled)`);
  process.exit(0);
}

const manifestPath = trialFile(trial, 'manifest.json');
if (!existsSync(manifestPath)) {
  writeJsonPretty(manifestPath, {
    trial,
    createdAt: new Date().toISOString(),
    slopsiftVersion: slopsiftVersion(),
    config,
    fixerPromptSha256: sha256(readFileSync(path.join(simplifyRoot, 'prompts', `${config.fixerPromptVersion}.md`), 'utf8')),
    judgePromptSha256: sha256(readFileSync(path.join(simplifyRoot, 'prompts', `${config.judgePromptVersion}.md`), 'utf8')),
  });
}

// run() cannot set engine concurrency (fixed at 4 runs, and the fixTrial
// parent occupies a slot), so build the engine directly. runDirectFast is
// what run() calls internally; it is not on the public Engine type.
const engine = createEngine({
  storage: new FileStorage(durablyDir),
  concurrency: Number(values.concurrency),
  checkpointEvery: 1,
}) as ReturnType<typeof createEngine> & {
  runDirectFast: (wf: typeof fixTrial, input: { trial: string; sourceIds: string[] }, opts: object) => Promise<unknown>;
};

// Full-list identity only while a resumable run holds it. Once that run has
// completed (or was cancelled), re-running with the full list would start a
// fresh parent and redo settled sources, so scope to pending instead.
const fullKey = `fix-${trial}-${sha256(selected.join(',')).slice(0, 8)}`;
const priorRuns = await engine.list({ key: fullKey });
const resumable = priorRuns.some((r) => r.status !== 'completed' && r.status !== 'cancelled');
const ids = resumable ? selected : pending;
const key = resumable ? fullKey : `fix-${trial}-${sha256(ids.join(',')).slice(0, 8)}`;

console.log(`trial ${trial}: fixing ${ids.length} sources (${settled.size} already settled, resumable=${resumable})`);
console.log(`ledger: $${totalSpentUsd().toFixed(4)} spent of $${config.capUsd} global cap`);

const result = await engine.runDirectFast(
  fixTrial,
  { trial, sourceIds: ids },
  {
    key,
    checkpointEvery: 1,
    budget: { usd: Number(values.budget) },
    onStep: (e: { status: string; label: string; attempt: number; ms?: number }) => {
      if (e.status === 'completed' || e.status === 'failed' || e.status === 'retrying') {
        console.log(`  [${e.status}] ${e.label} (attempt ${e.attempt}${e.ms !== undefined ? `, ${Math.round((e.ms ?? 0) / 1000)}s` : ''})`);
      }
    },
  },
);

console.log(JSON.stringify(result, null, 2));
console.log(`ledger after: $${totalSpentUsd().toFixed(4)}`);
await engine.stop();
process.exit(0);
