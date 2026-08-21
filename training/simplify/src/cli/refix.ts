import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { runFixer, type JudgeFeedback } from '../lib/fixer.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { lintDraft } from '../lib/slopsift.ts';
import { appendJsonl, readDraft, readJsonl, sha256, trialFile } from '../lib/store.ts';
import { judgeOne, type JudgeVerdict } from '../workflows/fix.ts';

// Re-runs the fixer for one settled source, seeded with the feedback of the
// judges that failed it, then judges the result with the current panel.
// Used when a human review says "the failing judge was right, rewrite it".

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    source: { type: 'string' },
  },
});

if (!values.trial || !values.source) {
  console.error('usage: tsx refix.ts --trial <name> --source <id>');
  process.exit(2);
}
const trial = values.trial as string;
const sourceId = values.source as string;
const config = loadConfig();

interface ReviewRecord {
  sourceId: string;
  original: string;
  fixerModel: string;
  judges: JudgeVerdict[];
}

const record = readJsonl<ReviewRecord>(trialFile(trial, 'human-review.jsonl')).find((r) => r.sourceId === sourceId);
if (!record) {
  console.error(`${sourceId} not found in human-review.jsonl`);
  process.exit(1);
}

const failing = record.judges.filter((j) => j.response.verdict === 'fail');
const merge = (pick: (r: JudgeVerdict['response']) => string[]) => [...new Set(failing.flatMap((j) => pick(j.response)))];
const seedFeedback: JudgeFeedback = {
  missingFacts: merge((r) => r.missing_facts),
  changedClaims: merge((r) => r.changed_claims),
  addedClaims: merge((r) => r.added_claims),
  lostLinks: merge((r) => r.lost_links_or_references),
  modalityChanges: merge((r) => r.modality_changes),
};
let feedback: JudgeFeedback = seedFeedback;

let rewrite: string | null = null;
for (let round = 1; round <= 4; round++) {
  const fix = await runFixer(trial, sourceId, feedback);
  if (fix.isError) {
    console.error(`fixer failed in round ${round}: ${fix.resultTail}`);
    process.exit(1);
  }
  const lint = await lintDraft(trial, sourceId);
  console.log(`round ${round}: ${lint.errorCount} errors, ${lint.warningCount} warnings`);
  if (lint.errorCount + lint.warningCount === 0) {
    rewrite = readDraft(trial, sourceId);
    break;
  }
  feedback = { missingFacts: [], changedClaims: [], addedClaims: [], lostLinks: [], modalityChanges: [] };
}

if (rewrite === null) {
  console.error('draft never came clean; not judging');
  process.exit(1);
}

const verdicts = await Promise.all(config.judgeModels.map((model) => judgeOne(model, record.original, rewrite as string, trial)));
const passes = verdicts.filter((v) => v.response.verdict === 'pass').length;
const outcome = passes * 2 > verdicts.length ? 'accepted' : passes * 2 === verdicts.length ? 'human-review' : 'dropped';
appendJsonl(trialFile(trial, 'refix.jsonl'), {
  ts: new Date().toISOString(),
  trial,
  sourceId,
  fixerModel: record.fixerModel,
  judgePromptVersion: config.judgePromptVersion,
  seedFeedback,
  passes,
  outcome,
  rewriteSha256: sha256(rewrite),
  rewrite,
  judges: verdicts,
});
console.log(`${sourceId}: ${passes}/${verdicts.length} pass -> ${outcome}`);
console.log(`ledger: $${totalSpentUsd().toFixed(4)}`);
