import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig } from '../lib/env.ts';
import { totalSpentUsd } from '../lib/openrouter.ts';
import { lintDir } from '../lib/slopsift.ts';
import { appendJsonl, readJsonl, trialDir, writeJsonPretty } from '../lib/store.ts';
import { echoRate, faithfulness } from '../lib/faithfulness.ts';
import { normalizeOutput, repetitionRatio } from '../lib/text.ts';
import { judgeOne, type JudgeVerdict } from '../workflows/fix.ts';

// Scores rewrite arms against the held-out split (TODO Phase 4).
// Arms:
//   original  - the untouched source text; lint-only floor (never judged).
//   pipeline  - the accepted rewrite from the fix loop (holdout assistant turn).
//   <label>   - any --gen label=path file of model generations
//               ({sourceId, output} per line, from train/generate.py).
// Every text is linted with slopsift; non-original arms also face the judge
// panel for meaning preservation. Results append to eval/results.jsonl keyed
// by (arm, sourceId), so re-running resumes and never re-bills judges.

const { values } = parseArgs({
  options: {
    trial: { type: 'string' },
    gen: { type: 'string', multiple: true, default: [] },
    'lint-only': { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
  },
});

if (!values.trial) {
  console.error('usage: tsx evaluate.ts --trial <name> [--gen label=path ...] [--lint-only] [--concurrency N]');
  process.exit(2);
}
const trial = values.trial as string;
const judgeOn = values['lint-only'] !== true;
const config = loadConfig();

interface HoldoutRow {
  messages: { role: string; content: string }[];
  sourceId: string;
  promptId: string | null;
  generatorModel: string | null;
  fixerModel: string;
}

const userPrefix = 'Simplify this:';
const holdout = readJsonl<HoldoutRow>(path.join(trialDir(trial), 'export', 'holdout.jsonl'));
if (holdout.length === 0) {
  console.error(`no holdout rows found; run export.ts for ${trial} first`);
  process.exit(2);
}

function originalOf(row: HoldoutRow): string {
  const user = row.messages.find((m) => m.role === 'user');
  if (!user) throw new Error(`${row.sourceId}: holdout row has no user turn`);
  return user.content.startsWith(userPrefix) ? user.content.slice(userPrefix.length).trim() : user.content.trim();
}

function pipelineRewriteOf(row: HoldoutRow): string {
  const assistant = row.messages.find((m) => m.role === 'assistant');
  if (!assistant) throw new Error(`${row.sourceId}: holdout row has no assistant turn`);
  return assistant.content;
}

interface ArmText {
  arm: string;
  sourceId: string;
  text: string;
}

const tasks: ArmText[] = [];
for (const row of holdout) {
  tasks.push({ arm: 'original', sourceId: row.sourceId, text: originalOf(row) });
  tasks.push({ arm: 'pipeline', sourceId: row.sourceId, text: pipelineRewriteOf(row) });
}
for (const spec of values.gen as string[]) {
  const eq = spec.indexOf('=');
  if (eq < 1) {
    console.error(`bad --gen spec "${spec}"; expected label=path`);
    process.exit(2);
  }
  const label = spec.slice(0, eq);
  const rows = readJsonl<{ sourceId: string; output: string }>(spec.slice(eq + 1));
  const byId = new Map(rows.map((r) => [r.sourceId, r.output]));
  for (const row of holdout) {
    const output = byId.get(row.sourceId);
    if (output === undefined) {
      console.error(`  ${label}: no generation for ${row.sourceId}, skipping`);
      continue;
    }
    tasks.push({ arm: label, sourceId: row.sourceId, text: normalizeOutput(output) });
  }
}

const evalDir = path.join(trialDir(trial), 'eval');
const resultsPath = path.join(evalDir, 'results.jsonl');
interface EvalRecord {
  arm: string;
  sourceId: string;
  words: number;
  lengthRatio: number;
  errorCount: number;
  warningCount: number;
  findingsPer1kWords: number;
  repetitionRatio: number;
  echoRate: number;
  anchorKeptRate: number;
  inventedAnchors: number;
  droppedAnchors: string[];
  ruleIds: string[];
  judged: boolean;
  judgePasses: number | null;
  judgeOutcome: string | null;
  costUsd: number;
}
// A lint-only record does not settle a pair once judging is requested: the
// judged re-run appends a fresh record and the summary keeps the last one.
const done = new Set(
  readJsonl<EvalRecord>(resultsPath)
    .filter((r) => r.judged || r.arm === 'original' || !judgeOn)
    .map((r) => `${r.arm}|${r.sourceId}`),
);
const originalWords = new Map(holdout.map((row) => [row.sourceId, wordCount(originalOf(row))]));
const originals = new Map(holdout.map((row) => [row.sourceId, originalOf(row)]));

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}

const pending = tasks.filter((t) => !done.has(`${t.arm}|${t.sourceId}`));
console.log(`evaluating ${pending.length} of ${tasks.length} (arm, source) pairs; judge panel ${judgeOn ? 'on' : 'off'} [${config.judgeModels.join(', ')}]`);
console.log(`ledger: $${totalSpentUsd().toFixed(4)} of $${config.capUsd}`);

async function evaluateOne(task: ArmText): Promise<void> {
  const dir = path.join(evalDir, 'work', task.arm, task.sourceId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'draft.md'), task.text.endsWith('\n') ? task.text : `${task.text}\n`, 'utf8');
  const lint = await lintDir(dir);
  const words = wordCount(task.text);
  const source = originals.get(task.sourceId) as string;
  const anchors = faithfulness(source, task.text);

  let judgePasses: number | null = null;
  let judgeOutcome: string | null = null;
  let costUsd = 0;
  const judged = task.arm !== 'original' && judgeOn;
  if (judged) {
    const verdicts: JudgeVerdict[] = await Promise.all(
      config.judgeModels.map((model) => judgeOne(model, originals.get(task.sourceId) as string, task.text, trial)),
    );
    judgePasses = verdicts.filter((v) => v.response.verdict === 'pass').length;
    judgeOutcome = judgePasses * 2 > verdicts.length ? 'pass' : 'fail';
    costUsd = verdicts.reduce((sum, v) => sum + v.costUsd, 0);
    appendJsonl(path.join(evalDir, 'judge-detail.jsonl'), { arm: task.arm, sourceId: task.sourceId, judges: verdicts });
  }

  const record: EvalRecord = {
    arm: task.arm,
    sourceId: task.sourceId,
    words,
    lengthRatio: round(words / (originalWords.get(task.sourceId) as number)),
    errorCount: lint.errorCount,
    warningCount: lint.warningCount,
    findingsPer1kWords: round(((lint.errorCount + lint.warningCount) * 1000) / Math.max(words, 1)),
    repetitionRatio: round(repetitionRatio(task.text)),
    echoRate: round(echoRate(source, task.text)),
    anchorKeptRate: round(anchors.keptRate),
    inventedAnchors: anchors.inventedCount,
    droppedAnchors: anchors.droppedSample,
    ruleIds: [...new Set(lint.findings.map((f) => f.ruleId))],
    judged,
    judgePasses,
    judgeOutcome,
    costUsd: Math.round(costUsd * 1e4) / 1e4,
  };
  appendJsonl(resultsPath, record);
  const judgeNote = judged ? `, judge ${judgePasses}/${config.judgeModels.length} -> ${judgeOutcome}` : '';
  console.log(
    `  ${task.arm}/${task.sourceId}: ${lint.errorCount}E ${lint.warningCount}W in ${words}w, ` +
      `echo ${(record.echoRate * 100).toFixed(0)}%, anchors kept ${(record.anchorKeptRate * 100).toFixed(0)}%` +
      `${anchors.inventedCount > 0 ? `, invented ${anchors.inventedCount}` : ''}${judgeNote}`,
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const queue = [...pending];
const workers = Array.from({ length: Number(values.concurrency) }, async () => {
  for (let task = queue.shift(); task !== undefined; task = queue.shift()) {
    try {
      await evaluateOne(task);
    } catch (error) {
      console.error(`  ${task.arm}/${task.sourceId}: FAILED ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
await Promise.all(workers);

// Summarize everything recorded so far (including earlier runs), keeping the
// last record per (arm, source) so judged re-runs supersede lint-only ones.
const byKey = new Map<string, EvalRecord>();
for (const r of readJsonl<EvalRecord>(resultsPath)) byKey.set(`${r.arm}|${r.sourceId}`, r);
const all = [...byKey.values()];
const arms = [...new Set(all.map((r) => r.arm))];
const summary = arms.map((arm) => {
  const rows = all.filter((r) => r.arm === arm);
  const judgedRows = rows.filter((r) => r.judged);
  const mean = (pick: (r: EvalRecord) => number) => round(rows.reduce((sum, r) => sum + pick(r), 0) / rows.length);
  return {
    arm,
    n: rows.length,
    meanErrors: mean((r) => r.errorCount),
    meanWarnings: mean((r) => r.warningCount),
    findingsPer1kWords: mean((r) => r.findingsPer1kWords),
    lintCleanRate: mean((r) => (r.errorCount + r.warningCount === 0 ? 1 : 0)),
    meanLengthRatio: mean((r) => r.lengthRatio),
    maxRepetitionRatio: round(Math.max(...rows.map((r) => r.repetitionRatio))),
    meanEchoRate: mean((r) => r.echoRate ?? 0),
    meanAnchorKeptRate: mean((r) => r.anchorKeptRate ?? 1),
    meanInventedAnchors: mean((r) => r.inventedAnchors ?? 0),
    judgePassRate: judgedRows.length === 0 ? null : round(judgedRows.filter((r) => r.judgeOutcome === 'pass').length / judgedRows.length),
  };
});
writeJsonPretty(path.join(evalDir, 'summary.json'), { trial, judgeModels: config.judgeModels, judgePromptVersion: config.judgePromptVersion, arms: summary });

console.log('\narm summary:');
for (const s of summary) {
  console.log(
    `  ${s.arm.padEnd(10)} n=${s.n}  findings/1kw=${s.findingsPer1kWords}  clean=${(s.lintCleanRate * 100).toFixed(0)}%  ` +
      `lenRatio=${s.meanLengthRatio}  echo=${(s.meanEchoRate * 100).toFixed(0)}%  kept=${(s.meanAnchorKeptRate * 100).toFixed(0)}%  ` +
      `invented=${s.meanInventedAnchors}  judgePass=${s.judgePassRate === null ? '-' : `${(s.judgePassRate * 100).toFixed(0)}%`}  maxRep=${s.maxRepetitionRatio}`,
  );
}
console.log(`\nwrote ${path.join(evalDir, 'summary.json')}`);
console.log(`ledger after: $${totalSpentUsd().toFixed(4)}`);
