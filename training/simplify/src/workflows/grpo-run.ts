// The reward run, end to end, as one resumable script.
//
// Everything here costs GPU money, which is the whole reason it is a workflow
// rather than a shell pipeline. Kill it, lose the laptop, run the same command
// again: the completed steps come back from the log and no GPU is paid for
// twice.
//
// The load-bearing detail is that spawning the training job and waiting for it
// are SEPARATE steps. train_grpo.py hands the call to Modal and returns in
// seconds, so the recorded value of the spawn step is a call id. A crash three
// hours in re-enters at the await step holding that id and rejoins the job that
// is already running, instead of starting a second one.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { workflow } from '@nikhilverma/durably';

import { fakeLlm, simplifyRoot } from '../lib/env.ts';

const exec = promisify(execFile);

// Same switch the OpenRouter client uses. A test that really shells out to
// `modal` either hangs on the network or bills a GPU, and neither is a test.
const fake = (bin: string, args: string[]) =>
  bin === 'modal' && args[1]?.includes('train_grpo')
    ? 'spawned test-run: call fc-fake-0001\n'
    : `fake ${bin} ${args.join(' ')}\n`;

async function modal(args: string[], timeoutMs: number, env: Record<string, string> = {}): Promise<string> {
  if (fakeLlm) return fake('modal', args);
  const { stdout } = await exec('modal', args, {
    cwd: simplifyRoot,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return stdout;
}

async function python(args: string[], timeoutMs: number): Promise<string> {
  if (fakeLlm) return fake('python3', args);
  const { stdout } = await exec('python3', args, {
    cwd: simplifyRoot,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env },
  });
  return stdout;
}

export interface GrpoInput {
  runName: string;
  initAdapter: string;
  steps: number;
  numGenerations: number;
  /** Drift inputs to score the finished adapter on, and the arm name to write. */
  driftInput: string;
  driftOut: string;
}

export const grpoRun = workflow<GrpoInput>()(async (ctx, input) => {
  // Fire and record the call id. Cheap, and the only step that must never run
  // twice: a second spawn is a second GPU bill for the same work.
  const callId = await ctx.step(
    async () => {
      const out = await modal(
        [
          'run',
          'train/train_grpo.py',
          '--run-name',
          input.runName,
          '--init-adapter',
          input.initAdapter,
          '--steps',
          String(input.steps),
          '--num-generations',
          String(input.numGenerations),
        ],
        15 * 60_000,
      );
      const match = out.match(/call\s+(\S+)/);
      if (!match) throw new Error(`no call id in spawn output: ${out.slice(-500)}`);
      return match[1];
    },
    { name: 'grpo-spawn', timeoutMs: 20 * 60_000 },
  );

  ctx.log(`grpo spawned as ${callId}`);

  // Hours long. No retry: if a reward run dies mid-flight the right move is to
  // read why, not to silently buy another one.
  const trained = await ctx.step(
    () => python(['train/await_call.py', callId, '21600'], 6 * 3600_000),
    { name: 'grpo-await', timeoutMs: 6.5 * 3600_000 },
  );

  ctx.log(`grpo finished: ${trained.trim().slice(-300)}`);

  // Cheap enough to redo, so it retries.
  const drift = await ctx.step(
    () =>
      modal(
        [
          'run',
          'train/drift_modal.py',
          '--adapter',
          `${input.runName}/final`,
          '--out-name',
          input.driftOut,
        ],
        90 * 60_000,
        // drift_modal.py bakes its input file into the image at build time, so
        // the file has to be named before the process starts rather than passed
        // as a flag.
        { SIMPLIFY_DRIFT_INPUT: input.driftInput },
      ),
    {
      name: 'drift-eval',
      timeoutMs: 95 * 60_000,
      retry: { attempts: 2, backoff: 'exponential', baseMs: 30_000 },
    },
  );

  return { callId, driftTail: drift.trim().split('\n').slice(-3).join(' | ') };
});
