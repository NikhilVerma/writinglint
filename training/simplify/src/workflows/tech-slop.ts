// Rewrites a human-written technical document into the voice a language model
// would naturally use, so the pair reads AI -> human.
//
// This replaces synthetic corruption, which was measurably the wrong input.
// Injected habits fire at 38.8 weighted findings per 1k against 24.1 for genuine
// model output, and the mix is wrong in both directions: six times the passive
// voice a model actually writes, eight times the machine vocabulary, and less
// than half the absolute claims. A model trained on that learns to hunt habits
// real AI writing does not have.
//
// The rewrite prompt never mentions habits, rules, or slop. It asks for a
// faithful restatement in the model's own words, and the voice comes free.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { workflow } from '@nikhilverma/durably';

import { loadConfig, simplifyRoot } from '../lib/env.ts';
import { chat } from '../lib/openrouter.ts';
import { stripEmoji } from '../lib/text.ts';

export interface SlopJob {
  name: string;
  model: string;
  inputDir: string;
  outputDir: string;
}

interface SlopOutcome {
  name: string;
  model: string;
  words: number;
  costUsd: number;
  skipped: boolean;
  truncated: boolean;
}

const wordCount = (t: string) => t.split(/\s+/).filter((w) => w !== '').length;

async function rewriteOne(job: SlopJob, maxTokens: number): Promise<SlopOutcome> {
  const { name, model, inputDir, outputDir } = job;
  const out = path.join(outputDir, name);
  if (existsSync(out)) {
    return { name, model, words: 0, costUsd: 0, skipped: true, truncated: false };
  }
  const config = loadConfig();
  const doc = readFileSync(path.join(inputDir, name), 'utf8');
  const template = readFileSync(path.join(simplifyRoot, 'prompts', 'human-rewrite-tech-v1.md'), 'utf8');
  const result = await chat({
    model,
    messages: [{ role: 'user', content: template.replace('{{DOCUMENT}}', doc.trim()) }],
    purpose: 'tech-slop',
    label: 'tech-slop',
    capUsd: config.capUsd,
    maxTokens,
    seed: config.seed,
    reasoning: { effort: 'low' },
  });
  const text = stripEmoji(result.text.trim());
  if (text.length === 0) throw new Error(`${model} returned empty rewrite (finish: ${result.finishReason ?? '?'})`);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(out, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  writeFileSync(
    out.replace(/\.md$/, '.json'),
    `${JSON.stringify({ name, model, promptVersion: 'human-rewrite-tech-v1', words: wordCount(text), sourceWords: wordCount(doc), costUsd: result.costUsd, finishReason: result.finishReason, requestId: result.requestId }, null, 2)}\n`,
    'utf8',
  );
  return {
    name,
    model,
    words: wordCount(text),
    costUsd: result.costUsd,
    skipped: false,
    truncated: result.finishReason === 'length',
  };
}

export const rewriteTechDocs = workflow<{ jobs: SlopJob[]; maxTokens: number; concurrency: number }>()(
  async (ctx, { jobs, maxTokens, concurrency }) => {
    const results = await ctx.parallel(
      jobs.map((job) => () =>
        ctx.step(() => rewriteOne(job, maxTokens), {
          name: `slop-${job.name}`,
          retry: { attempts: 2, backoff: 'exponential', baseMs: 3000 },
          timeoutMs: 600_000,
        }),
      ),
      { concurrency },
    );
    const ok = results.filter((r) => r.ok).map((r) => (r as { ok: true; value: SlopOutcome }).value);
    return {
      written: ok.filter((r) => !r.skipped).length,
      skipped: ok.filter((r) => r.skipped).length,
      truncated: ok.filter((r) => r.truncated).map((r) => r.name),
      failed: jobs.filter((_, i) => !results[i].ok).map((j) => j.name),
      costUsd: Math.round(ok.reduce((s, r) => s + r.costUsd, 0) * 1e4) / 1e4,
    };
  },
);
