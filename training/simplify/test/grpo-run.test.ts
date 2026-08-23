import assert from 'node:assert/strict';
import test from 'node:test';

import { testEngine } from '@nikhilverma/durably/test';

import { grpoRun } from '../src/workflows/grpo-run.ts';

const input = {
  runName: 'test-run',
  initAdapter: 'test-sft/final',
  promptsFile: 'runs/grpo/prompts-test.jsonl',
  steps: 10,
  numGenerations: 8,
  driftInput: 'runs/inputs.jsonl',
  driftOut: 'test-out',
};

test('a crash mid-run never spawns a second GPU job', async () => {
  // The failure this guards against costs real money: the reward run is hours
  // on two H100s, and a naive retry would launch a second one while the first
  // is still burning. The spawn step records the call id, so a resume rejoins
  // the job that is already running.
  const te = testEngine();
  const crashed = await te.run(grpoRun, input, { crashAfter: 'grpo-spawn' });
  const done = await te.resume(crashed.runId);

  assert.equal(done.status, 'completed');
  const spawn = done.steps.find((s) => s.label === 'grpo-spawn');
  assert.ok(spawn, 'the spawn step must be recorded');
  assert.equal(spawn.executions, 1, 'the GPU job must be paid for exactly once');
});

test('every step runs once across a crash before the drift eval', async () => {
  const te = testEngine();
  const crashed = await te.run(grpoRun, input, { crashAfter: 'grpo-await' });
  const done = await te.resume(crashed.runId);

  assert.equal(done.status, 'completed');
  assert.ok(
    done.steps.every((s) => s.executions === 1),
    `re-executed: ${done.steps.filter((s) => s.executions !== 1).map((s) => s.label).join(', ')}`,
  );
});
