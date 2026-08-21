import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.SIMPLIFY_FAKE = '1';
process.env.SIMPLIFY_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'simplify-test-'));

const { testEngine } = await import('@nikhilverma/durably/test');
const { generateSources } = await import('../src/workflows/generate.ts');
const { fixSource } = await import('../src/workflows/fix.ts');
const { sourcesDir, runsDir } = await import('../src/lib/env.ts');
const { readJsonl, trialFile, sourcePath } = await import('../src/lib/store.ts');
const { writeFileSync } = await import('node:fs');

test('generation survives a crash without re-running completed calls', async () => {
  const te = testEngine();
  const crashed = await te.run(generateSources, { count: 3, batch: 'test' }, { crashAfter: 'plan' });
  assert.notEqual(crashed.status, 'completed');

  const done = await te.resume(crashed.runId);
  assert.equal(done.status, 'completed');
  assert.ok(done.steps.every((s: { executions: number }) => s.executions === 1));

  const written = readdirSync(sourcesDir).filter((name) => name.endsWith('.md'));
  assert.equal(written.length, 3);
});

test('fix loop lints, fixes, judges, and accepts a fake source', async () => {
  const te = testEngine();
  const generated = readdirSync(sourcesDir).find((name) => name.endsWith('.md'));
  assert.ok(generated, 'generation test must run first');
  const sourceId = generated.slice('source-'.length, -'.md'.length);

  const done = await te.run(fixSource, { trial: 'test-trial', sourceId });
  assert.equal(done.status, 'completed');
  assert.equal((done.result as { outcome: string }).outcome, 'accepted');

  const accepted = readJsonl<{ sourceId: string; rewrite: string; judges: unknown[] }>(
    trialFile('test-trial', 'accepted.jsonl'),
  );
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].sourceId, sourceId);
  assert.ok(!accepted[0].rewrite.includes('game-changer'));
  assert.equal(accepted[0].judges.length, 3);

  const attempts = readJsonl<{ phase: string }>(trialFile('test-trial', 'attempts.jsonl'));
  assert.ok(attempts.some((a) => a.phase === 'fix'));
  assert.ok(attempts.some((a) => a.phase === 'judge'));
  assert.ok(runsDir.includes('simplify-test-'), 'test must write only to the temp data dir');
});

test('a source that already passes the lint is rejected, not judged', async () => {
  const te = testEngine();
  const sourceId = 'cleanfake0001';
  writeFileSync(sourcePath(sourceId), 'The elevator is out from November 3 to November 21.\n', 'utf8');

  const done = await te.run(fixSource, { trial: 'test-trial', sourceId });
  assert.equal(done.status, 'completed');
  assert.equal((done.result as { outcome: string; fixerRuns: number; judgeRounds: number }).outcome, 'rejected');
  assert.equal((done.result as { fixerRuns: number }).fixerRuns, 0);
  assert.equal((done.result as { judgeRounds: number }).judgeRounds, 0);

  const rejected = readJsonl<{ sourceId: string; rejectReason: string }>(trialFile('test-trial', 'rejected.jsonl'));
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].rejectReason, 'source-passed-lint-unchanged');
});
