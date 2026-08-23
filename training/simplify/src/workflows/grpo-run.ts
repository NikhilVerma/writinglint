// The reward run, end to end, as one resumable script.
//
// Everything here costs GPU money, which is the whole reason it is a workflow
// rather than a shell pipeline. Kill it, lose the laptop, run the same command
// again: the completed steps come back from the log and no GPU is paid for
// twice.
//
// The load-bearing detail is that spawning the training job and waiting for it
// are SEPARATE steps. The spawn returns in seconds, so the recorded value of
// that step is a call id. A crash three hours in re-enters at the await step
// holding that id and rejoins the job that is already running, instead of
// starting a second one.
//
// The job has to be spawned against a DEPLOYED app, not through `modal run`.
// `modal run` builds an ephemeral app and stops it the moment the local
// entrypoint returns, which takes the spawned call down with it: two attempts
// resolved to an empty RemoteError inside a minute and read like a crash in the
// training code. So the deploy is its own step, and the spawn goes through
// Function.from_name.

import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

import { workflow } from '@nikhilverma/durably';

import { fakeLlm, simplifyRoot } from '../lib/env.ts';

const exec = promisify(execFile);

// Same switch the OpenRouter client uses. A test that really shells out to
// `modal` either hangs on the network or bills a GPU, and neither is a test.
const fake = (bin: string, args: string[]) =>
  args.some((a) => a.includes('spawn_deployed'))
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

// The interpreter that can `import modal`, which is the one the `modal` CLI
// itself runs under. A bare `python3` is whatever is first on PATH, and here
// that is a different install without the package.
const modalPython = (() => {
  try {
    const shebang = readFileSync(execFileSync('which', ['modal']).toString().trim(), 'utf8').split('\n')[0];
    const match = shebang.match(/^#!\s*(\S+)/);
    if (match) return match[1];
  } catch {
    // Fall through to the PATH interpreter and let the step report the failure.
  }
  return 'python3';
})();

async function python(args: string[], timeoutMs: number, env: Record<string, string> = {}): Promise<string> {
  if (fakeLlm) return fake('python3', args);
  const { stdout } = await exec(modalPython, args, {
    cwd: simplifyRoot,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return stdout;
}

export interface GrpoInput {
  runName: string;
  /** The prompt set to bake into the image. train_grpo.py falls back to
   * runs/grpo/prompts.jsonl, which is a stale file from an earlier generation
   * that still contains benchmark documents, so leaving it unset trains the
   * reward run on its own eval. */
  promptsFile: string;
  initAdapter: string;
  steps: number;
  numGenerations: number;
  /** Drift inputs to score the finished adapter on, and the arm name to write. */
  driftInput: string;
  driftOut: string;
}

export const grpoRun = workflow<GrpoInput>()(async (ctx, input) => {
  // Bakes the prompt set into the image, so it has to carry the same env var
  // the spawn used to. Idempotent and free, but it still gets its own step
  // because a rebuild can take ten minutes and should not be redone on resume.
  await ctx.step(
    () => modal(['deploy', 'train/train_grpo.py'], 25 * 60_000, { SIMPLIFY_GRPO_PROMPTS: input.promptsFile }),
    { name: 'grpo-deploy', timeoutMs: 30 * 60_000, retry: { attempts: 2, backoff: 'exponential', baseMs: 20_000 } },
  );

  // Fire and record the call id. Cheap, and the only step that must never run
  // twice: a second spawn is a second GPU bill for the same work.
  const callId = await ctx.step(
    async () => {
      const out = await python(
        [
          'train/spawn_deployed.py',
          '--run-name',
          input.runName,
          '--init-adapter',
          input.initAdapter,
          '--steps',
          String(input.steps),
          '--num-generations',
          String(input.numGenerations),
        ],
        10 * 60_000,
      );
      const match = out.match(/call\s+(\S+)/);
      if (!match) throw new Error(`no call id in spawn output: ${out.slice(-500)}`);
      return match[1];
    },
    { name: 'grpo-spawn', timeoutMs: 15 * 60_000 },
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
