import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { workflow } from '@nikhilverma/durably';

import { loadConfig, simplifyRoot, sourcesDir } from '../lib/env.ts';
import { chat } from '../lib/openrouter.ts';
import { sha256, sourceIdFor, sourceMetaPath, sourcePath, writeJsonPretty } from '../lib/store.ts';
import { stripEmoji } from '../lib/text.ts';

interface PromptRecord {
  id: string;
  role: string;
  prompt: string;
}

export interface GenerateTask {
  sourceId: string;
  model: string;
  promptId: string;
  role: string;
  prompt: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic plan: every (prompt, model) combo, seeded shuffle, first `count`. */
export function buildPlan(count: number): GenerateTask[] {
  const config = loadConfig();
  const prompts = readFileSync(path.join(simplifyRoot, 'prompts', 'source-prompts.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as PromptRecord);
  const combos: GenerateTask[] = [];
  for (const prompt of prompts) {
    for (const model of config.generatorModels) {
      combos.push({
        sourceId: sourceIdFor(model, prompt.id, config.promptVersion),
        model,
        promptId: prompt.id,
        role: prompt.role,
        prompt: prompt.prompt,
      });
    }
  }
  const random = mulberry32(config.seed);
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  return combos.slice(0, count);
}

interface GenerateOutcome {
  sourceId: string;
  model: string;
  promptId: string;
  skipped: boolean;
  costUsd: number;
}

async function generateOne(task: GenerateTask, batch: string): Promise<GenerateOutcome> {
  const config = loadConfig();
  if (existsSync(sourcePath(task.sourceId))) {
    return { sourceId: task.sourceId, model: task.model, promptId: task.promptId, skipped: true, costUsd: 0 };
  }
  // Chat-shaped, no system prompt, no style instructions: the realistic path
  // that produces genuine model habits rather than caricature.
  const result = await chat({
    model: task.model,
    messages: [{ role: 'user', content: task.prompt }],
    purpose: 'generate',
    label: batch,
    capUsd: config.capUsd,
    maxTokens: config.generatorMaxTokens,
    seed: config.seed,
  });
  if (result.text.trim() === '') throw new Error(`${task.model} returned empty text for ${task.promptId}`);
  const text = stripEmoji(result.text);
  mkdirSync(sourcesDir, { recursive: true });
  writeFileSync(sourcePath(task.sourceId), text, 'utf8');
  writeJsonPretty(sourceMetaPath(task.sourceId), {
    sourceId: task.sourceId,
    batch,
    model: task.model,
    promptId: task.promptId,
    role: task.role,
    promptVersion: config.promptVersion,
    promptSha256: sha256(task.prompt),
    sourceSha256: sha256(text),
    requestId: result.requestId,
    finishReason: result.finishReason,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    costUsd: result.costUsd,
    seed: config.seed,
    createdAt: new Date().toISOString(),
  });
  return { sourceId: task.sourceId, model: task.model, promptId: task.promptId, skipped: false, costUsd: result.costUsd };
}

export const generateSources = workflow<{ count: number; batch: string }>()(async (ctx, { count, batch }) => {
  const plan = await ctx.step(() => buildPlan(count), { name: 'plan' });
  const results = await ctx.parallel(
    plan.map((task) => () =>
      ctx.step(() => generateOne(task, batch), {
        name: `gen:${task.sourceId}`,
        timeoutMs: 300_000,
        retry: { attempts: 3, backoff: 'exponential', baseMs: 2_000, jitter: true },
      }),
    ),
    { concurrency: 4 },
  );
  const generated = results.filter((r) => r.ok).map((r) => r.value);
  const failed = plan.filter((_, i) => !results[i].ok).map((task, ) => task.sourceId);
  const costUsd = generated.reduce((sum, g) => sum + g.costUsd, 0);
  await ctx.charge({ usd: costUsd });
  ctx.log(`generated ${generated.filter((g) => !g.skipped).length}, skipped ${generated.filter((g) => g.skipped).length}, failed ${failed.length}, $${costUsd.toFixed(4)}`);
  return {
    batch,
    generated: generated.filter((g) => !g.skipped).map((g) => g.sourceId),
    skipped: generated.filter((g) => g.skipped).map((g) => g.sourceId),
    failed,
    costUsd,
  };
});
