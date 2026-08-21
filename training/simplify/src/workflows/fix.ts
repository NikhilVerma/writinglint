import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { workflow } from '@nikhilverma/durably';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { chat } from '../lib/openrouter.ts';
import { lintDraft, slopsiftVersion } from '../lib/slopsift.ts';
import { armFor, runFixer, type FixerResult, type JudgeFeedback } from '../lib/fixer.ts';
import { maxRepetitionRatio, minProseRatio, proseRatio, repetitionRatio, stripEmoji } from '../lib/text.ts';
import {
  appendJsonl,
  draftPath,
  readDraft,
  readJsonl,
  sha256,
  sourceMetaPath,
  sourcePath,
  trialFile,
  workDir,
  writeJsonPretty,
} from '../lib/store.ts';

const judgeSchema = JSON.parse(
  readFileSync(path.join(simplifyRoot, 'schemas', 'judge-response.schema.json'), 'utf8'),
) as Record<string, unknown>;

interface JudgeResponse {
  missing_facts: string[];
  changed_claims: string[];
  added_claims: string[];
  lost_links_or_references: string[];
  modality_changes: string[];
  verdict: 'pass' | 'fail';
  reasoning: string;
}

export interface JudgeVerdict {
  model: string;
  response: JudgeResponse;
  costUsd: number;
  requestId: string;
}

interface DraftSnapshot {
  draft: string;
  draftSha: string;
  errorCount: number;
  warningCount: number;
  ruleIds: string[];
}

function setupWork(trial: string, sourceId: string): { original: string; originalSha: string } {
  const dir = workDir(trial, sourceId);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(draftPath(trial, sourceId))) {
    copyFileSync(sourcePath(sourceId), draftPath(trial, sourceId));
  }
  const original = stripEmoji(readFileSync(sourcePath(sourceId), 'utf8'));
  return { original, originalSha: sha256(original) };
}

async function inspectDraft(trial: string, sourceId: string): Promise<DraftSnapshot> {
  // Fixers (or the source copy) may carry emoji; normalize before linting so
  // slopsift never sees them.
  const raw = readDraft(trial, sourceId);
  const clean = stripEmoji(raw);
  if (clean !== raw) writeFileSync(draftPath(trial, sourceId), clean, 'utf8');
  const lint = await lintDraft(trial, sourceId);
  const draft = readDraft(trial, sourceId);
  return {
    draft,
    draftSha: sha256(draft),
    errorCount: lint.errorCount,
    warningCount: lint.warningCount,
    ruleIds: [...new Set(lint.findings.map((f) => f.ruleId))],
  };
}

export async function judgeOne(model: string, original: string, rewrite: string, trial: string): Promise<JudgeVerdict> {
  const config = loadConfig();
  const system = readFileSync(path.join(simplifyRoot, 'prompts', `${config.judgePromptVersion}.md`), 'utf8');
  const result = await chat({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `ORIGINAL:\n<<<\n${original}\n>>>\n\nREWRITE:\n<<<\n${rewrite}\n>>>` },
    ],
    purpose: 'judge',
    label: trial,
    capUsd: config.capUsd,
    maxTokens: config.judgeMaxTokens,
    temperature: 0,
    seed: config.seed,
    // Reasoning models (qwen, deepseek) burn the whole completion budget on
    // reasoning at default effort and return truncated JSON.
    reasoning: { effort: 'low' },
    responseFormat: {
      type: 'json_schema',
      json_schema: { name: 'meaning_judge', strict: true, schema: judgeSchema },
    },
  });
  const response = JSON.parse(result.text) as JudgeResponse;
  if (response.verdict !== 'pass' && response.verdict !== 'fail') {
    throw new Error(`judge ${model} returned invalid verdict: ${String(response.verdict)}`);
  }
  return { model, response, costUsd: result.costUsd, requestId: result.requestId };
}

function mergeFeedback(verdicts: JudgeVerdict[]): JudgeFeedback {
  const merge = (pick: (r: JudgeResponse) => string[]) => [...new Set(verdicts.flatMap((v) => pick(v.response)))];
  return {
    missingFacts: merge((r) => r.missing_facts),
    changedClaims: merge((r) => r.changed_claims),
    addedClaims: merge((r) => r.added_claims),
    lostLinks: merge((r) => r.lost_links_or_references),
    modalityChanges: merge((r) => r.modality_changes),
  };
}

export type Outcome = 'accepted' | 'rejected' | 'unresolved' | 'human-review';

export interface FixSourceResult {
  sourceId: string;
  outcome: Outcome;
  fixerRuns: number;
  judgeRounds: number;
  judgeCostUsd: number;
  harnessCostUsd: number;
}

export const fixSource = workflow<{ trial: string; sourceId: string }>()(async (ctx, { trial, sourceId }) => {
  const config = loadConfig();
  const setup = await ctx.step(() => setupWork(trial, sourceId), { name: 'setup' });

  // Screens from the trial-001 human review: degenerate generation loops and
  // code dumps make unusable training pairs no matter what the judges say.
  const sourceProseRatio = proseRatio(setup.original);
  const sourceRepetitionRatio = repetitionRatio(setup.original);

  let seq = 0;
  let fixerRuns = 0;
  let judgeRounds = 0;
  let judgeCostUsd = 0;
  let harnessCostUsd = 0;
  let feedback: JudgeFeedback | null = null;
  let lastFailedSha: string | null = null;
  let outcome: Outcome | null = null;
  let rejectReason: string | null = null;
  let finalSnapshot: DraftSnapshot | null = null;
  let finalVerdicts: JudgeVerdict[] = [];

  if (sourceRepetitionRatio > maxRepetitionRatio) {
    outcome = 'rejected';
    rejectReason = 'source-degenerate';
  } else if (sourceProseRatio < minProseRatio) {
    outcome = 'rejected';
    rejectReason = 'source-mostly-code-or-markup';
  }

  while (outcome === null) {
    seq += 1;
    const snapshot = await ctx.step(() => inspectDraft(trial, sourceId), { name: `snapshot:${seq}` });
    const dirty = snapshot.errorCount + snapshot.warningCount > 0;

    // A source that never fails the lint is not usable slop: there is nothing
    // for the fixer to fix and an original/rewrite pair would be a no-op.
    if (seq === 1 && !dirty && snapshot.draftSha === setup.originalSha) {
      outcome = 'rejected';
      rejectReason = 'source-passed-lint-unchanged';
      finalSnapshot = snapshot;
      break;
    }

    if (!dirty && snapshot.draftSha !== lastFailedSha) {
      const judged = await ctx.parallel(
        config.judgeModels.map((model) => () =>
          ctx.step(() => judgeOne(model, setup.original, snapshot.draft, trial), {
            name: `judge:${seq}:${model}`,
            timeoutMs: 300_000,
            retry: { attempts: 3, backoff: 'exponential', baseMs: 2_000, jitter: true },
          }),
        ),
      );
      const failed = judged.find((r) => !r.ok);
      if (failed) {
        const cause = (failed as { error: unknown }).error;
        const detail = cause instanceof Error ? cause.message : JSON.stringify(cause);
        throw new Error(`judge call failed for ${sourceId}: ${detail}`);
      }
      const verdicts = judged.map((r) => (r as { ok: true; value: JudgeVerdict }).value);
      judgeRounds += 1;
      judgeCostUsd += verdicts.reduce((sum, v) => sum + v.costUsd, 0);
      await ctx.charge({ usd: verdicts.reduce((sum, v) => sum + v.costUsd, 0) });
      await ctx.step(
        () =>
          appendJsonl(trialFile(trial, 'attempts.jsonl'), {
            ts: new Date().toISOString(),
            trial,
            sourceId,
            seq,
            phase: 'judge',
            draftSha: snapshot.draftSha,
            judges: verdicts,
          }),
        { name: `log-judge:${seq}` },
      );
      // Majority decides; an odd panel (3 judges) means a 2-1 split is a
      // verdict, not a tie. human-review only remains for exact even splits.
      const passes = verdicts.filter((v) => v.response.verdict === 'pass').length;
      if (passes * 2 > verdicts.length) {
        outcome = 'accepted';
        finalSnapshot = snapshot;
        finalVerdicts = verdicts;
        break;
      }
      if (passes * 2 === verdicts.length) {
        outcome = 'human-review';
        finalSnapshot = snapshot;
        finalVerdicts = verdicts;
        break;
      }
      feedback = mergeFeedback(verdicts);
      lastFailedSha = snapshot.draftSha;
    }

    if (fixerRuns >= config.attemptLimit) {
      outcome = dirty ? 'unresolved' : 'rejected';
      if (!dirty) rejectReason = 'meaning-not-preserved';
      finalSnapshot = snapshot;
      break;
    }
    fixerRuns += 1;
    const currentFeedback = feedback;
    const fix: FixerResult = await ctx.step(() => runFixer(trial, sourceId, currentFeedback), {
      name: `fix:${seq}`,
      timeoutMs: config.fixerTimeoutMs + 60_000,
      retry: { attempts: 3, backoff: 'exponential', baseMs: 5_000, jitter: true },
    });
    harnessCostUsd += fix.harnessCostUsd ?? 0;
    await ctx.step(
      () =>
        appendJsonl(trialFile(trial, 'attempts.jsonl'), {
          ts: new Date().toISOString(),
          trial,
          sourceId,
          seq,
          phase: 'fix',
          before: {
            draftSha: snapshot.draftSha,
            errorCount: snapshot.errorCount,
            warningCount: snapshot.warningCount,
            ruleIds: snapshot.ruleIds,
          },
          judgeFeedback: currentFeedback,
          fixer: fix,
        }),
      { name: `log-fix:${seq}` },
    );
  }

  await ctx.step(
    () => {
      const meta = existsSync(sourceMetaPath(sourceId))
        ? (JSON.parse(readFileSync(sourceMetaPath(sourceId), 'utf8')) as Record<string, unknown>)
        : {};
      const record = {
        ts: new Date().toISOString(),
        trial,
        sourceId,
        outcome,
        rejectReason,
        generatorModel: meta.model ?? null,
        promptId: meta.promptId ?? null,
        role: meta.role ?? null,
        fixerModel: armFor(trial, sourceId),
        fixerRuns,
        judgeRounds,
        judgeCostUsd,
        harnessCostUsd,
        proseRatio: Number(sourceProseRatio.toFixed(3)),
        repetitionRatio: Number(sourceRepetitionRatio.toFixed(3)),
        originalSha256: setup.originalSha,
        rewriteSha256: finalSnapshot?.draftSha ?? null,
        original: setup.original,
        rewrite: finalSnapshot?.draft ?? null,
        remainingFindings: finalSnapshot ? { errorCount: finalSnapshot.errorCount, warningCount: finalSnapshot.warningCount, ruleIds: finalSnapshot.ruleIds } : null,
        judges: finalVerdicts,
      };
      const file =
        outcome === 'accepted'
          ? 'accepted.jsonl'
          : outcome === 'human-review'
            ? 'human-review.jsonl'
            : outcome === 'rejected'
              ? 'rejected.jsonl'
              : 'unresolved.jsonl';
      appendJsonl(trialFile(trial, file), record);
    },
    { name: 'finalize' },
  );

  return { sourceId, outcome, fixerRuns, judgeRounds, judgeCostUsd, harnessCostUsd } as FixSourceResult;
});

export const fixTrial = workflow<{ trial: string; sourceIds: string[] }>()(async (ctx, { trial, sourceIds }) => {
  const handles = await ctx.spawnAll(sourceIds.map((sourceId) => [fixSource, { trial, sourceId }] as const));
  const results = await ctx.joinAll(handles);
  const outcomes = results.map((r, i) => (r.ok ? (r.value as FixSourceResult) : { sourceId: sourceIds[i], outcome: 'error' as const, error: String((r as { error: unknown }).error) }));
  const report = await ctx.step(() => writeReport(trial, outcomes), { name: 'report' });
  return report;
});

function writeReport(trial: string, outcomes: unknown[]): Record<string, unknown> {
  const counts: Record<string, number> = {};
  for (const file of ['accepted', 'rejected', 'unresolved', 'human-review']) {
    counts[file] = readJsonl(trialFile(trial, `${file}.jsonl`)).length;
  }
  const attempts = readJsonl<{ phase: string }>(trialFile(trial, 'attempts.jsonl'));
  const report = {
    trial,
    finishedAt: new Date().toISOString(),
    slopsiftVersion: slopsiftVersion(),
    counts,
    fixAttempts: attempts.filter((a) => a.phase === 'fix').length,
    judgeRounds: attempts.filter((a) => a.phase === 'judge').length,
    outcomes,
  };
  writeJsonPretty(trialFile(trial, 'report.json'), report);
  return report;
}
