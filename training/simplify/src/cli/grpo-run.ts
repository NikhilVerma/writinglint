// Runs the reward pipeline as one resumable command.
//
//   npx tsx src/cli/grpo-run.ts --init-adapter qwen3-8b-sft-v12/final \
//     --run-name qwen3-8b-grpo-v12 --steps 150
//
// Re-run the identical command after a crash and it rejoins the running job.

import { parseArgs } from 'node:util';

import { run } from '@nikhilverma/durably';

import { grpoRun } from '../workflows/grpo-run.ts';

const { values } = parseArgs({
  options: {
    'run-name': { type: 'string', default: 'qwen3-8b-grpo-v12' },
    'init-adapter': { type: 'string', default: 'qwen3-8b-sft-v12/final' },
    steps: { type: 'string', default: '150' },
    'num-generations': { type: 'string', default: '8' },
    prompts: { type: 'string', default: 'runs/grpo/prompts-v12.jsonl' },
    'drift-input': { type: 'string', default: 'runs/drift-inputs-v11.jsonl' },
    'drift-out': { type: 'string', default: 'grpo-v12-merged' },
  },
});

const result = await run(
  grpoRun,
  {
    runName: values['run-name'] as string,
    initAdapter: values['init-adapter'] as string,
    promptsFile: values.prompts as string,
    steps: Number(values.steps),
    numGenerations: Number(values['num-generations']),
    driftInput: values['drift-input'] as string,
    driftOut: values['drift-out'] as string,
  },
  {
    // Each step is a GPU job. Checkpoint after every one of them.
    checkpointEvery: 1,
    key: `grpo-${values['run-name']}`,
    onStep: (s) => console.error(`[${s.status}] ${s.label}${s.attempt > 1 ? ` attempt ${s.attempt}` : ''}`),
  },
);

console.log(JSON.stringify(result, null, 2));
