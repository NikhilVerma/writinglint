import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import { fakeLlm, loadConfig, simplifyRoot } from './env.ts';
import { chat } from './openrouter.ts';
import { lintDraft } from './slopsift.ts';
import { draftPath, trialFile, workDir } from './store.ts';
import { stripEmoji } from './text.ts';
import type { LintFinding } from './slopsift.ts';

export interface JudgeFeedback {
  missingFacts: string[];
  changedClaims: string[];
  addedClaims: string[];
  lostLinks: string[];
  modalityChanges: string[];
}

export interface FixerResult {
  fixerModel: string;
  exitCode: number;
  durationMs: number;
  numTurns: number | null;
  harnessCostUsd: number | null;
  isError: boolean;
  resultTail: string;
}

/**
 * Which fixer handles this source: the trial's arms.json maps sourceId to
 * either the harness fixer id from config (`fixerModel`, no slash) or an
 * OpenRouter model id. Sources without an entry keep the harness fixer, so
 * trials created before the pool existed behave unchanged.
 */
export function armFor(trial: string, sourceId: string): string {
  const config = loadConfig();
  try {
    const arms = JSON.parse(readFileSync(trialFile(trial, 'arms.json'), 'utf8')) as Record<string, string>;
    return arms[sourceId] ?? config.fixerModel;
  } catch {
    return config.fixerModel;
  }
}

function buildFeedbackBlock(feedback: JudgeFeedback | null): string {
  if (!feedback) return '';
  const lines: string[] = [
    '',
    'A previous revision of draft.md passed the lint but failed an independent',
    'meaning check against the original document. While keeping the lint clean,',
    'also repair these problems:',
    '',
  ];
  const sections: [string, string[]][] = [
    ['Facts missing from the rewrite', feedback.missingFacts],
    ['Claims whose meaning changed', feedback.changedClaims],
    ['Claims added that the original does not contain', feedback.addedClaims],
    ['Links or references lost', feedback.lostLinks],
    ['Certainty or obligation changed', feedback.modalityChanges],
  ];
  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push(`${title}:`);
    for (const item of items) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildPrompt(feedback: JudgeFeedback | null): string {
  const config = loadConfig();
  const template = readFileSync(path.join(simplifyRoot, 'prompts', `${config.fixerPromptVersion}.md`), 'utf8');
  return template.replace('{{JUDGE_FEEDBACK}}', buildFeedbackBlock(feedback)).trimEnd();
}

/**
 * Run the coding-harness fixer (headless claude) inside the isolated work
 * directory. The harness only sees draft.md and the globally installed
 * slopsift binary; it has no path into this repository.
 */
export async function runFixer(trial: string, sourceId: string, feedback: JudgeFeedback | null): Promise<FixerResult> {
  if (fakeLlm) return fakeFixer(trial, sourceId);
  const arm = armFor(trial, sourceId);
  if (arm.includes('/')) return runChatFixer(trial, sourceId, feedback, arm);
  return runHarnessFixer(trial, sourceId, feedback);
}

async function runHarnessFixer(trial: string, sourceId: string, feedback: JudgeFeedback | null): Promise<FixerResult> {
  const config = loadConfig();
  const prompt = buildPrompt(feedback);
  const started = Date.now();
  let stdout = '';
  let exitCode = 0;
  try {
    // Async exec: a synchronous call here blocks the event loop for the whole
    // harness run and serializes every concurrent workflow in the engine.
    ({ stdout } = await execFileAsync(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        config.fixerModel,
        '--allowedTools',
        'Read,Edit,Write,Bash(slopsift:*)',
        '--max-turns',
        String(config.fixerMaxTurns),
        '--output-format',
        'json',
      ],
      { cwd: workDir(trial, sourceId), encoding: 'utf8', timeout: config.fixerTimeoutMs, maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string };
    exitCode = typeof failure.code === 'number' ? failure.code : -1;
    stdout = failure.stdout ?? '';
  }
  let numTurns: number | null = null;
  let harnessCostUsd: number | null = null;
  let isError = exitCode !== 0;
  let resultTail = stdout.slice(-500);
  try {
    const parsed = JSON.parse(stdout) as { num_turns?: number; total_cost_usd?: number; is_error?: boolean; result?: string };
    numTurns = parsed.num_turns ?? null;
    harnessCostUsd = parsed.total_cost_usd ?? null;
    isError = parsed.is_error ?? isError;
    resultTail = (parsed.result ?? '').slice(-500);
  } catch {
    // keep raw tail
  }
  return { fixerModel: config.fixerModel, exitCode, durationMs: Date.now() - started, numTurns, harnessCostUsd, isError, resultTail };
}

/**
 * Chat-loop fixer arm: we lint locally, hand the findings and the draft to an
 * OpenRouter model, and write its full rewrite back to draft.md. The outer
 * fixSource loop re-lints and re-invokes until clean, so one call per round
 * is enough. Cost lands in the shared ledger under purpose "fix".
 */
async function runChatFixer(trial: string, sourceId: string, feedback: JudgeFeedback | null, model: string): Promise<FixerResult> {
  const config = loadConfig();
  const started = Date.now();
  const lint = await lintDraft(trial, sourceId);
  const draft = readFileSync(draftPath(trial, sourceId), 'utf8');
  const findings = lint.findings
    .map((f) => `- ${f.ruleId} [${f.level}] line ${f.line}: ${f.message}\n  offending text: "${f.text}"`)
    .join('\n');
  const template = readFileSync(path.join(simplifyRoot, 'prompts', `${config.fixerChatPromptVersion}.md`), 'utf8');
  const judgeBlock = buildFeedbackBlock(feedback);
  const prompt = template
    .replace('{{FINDINGS}}', findings || '(none reported — re-read the constraints and improve clarity only)')
    .replace('{{JUDGE_FEEDBACK}}', judgeBlock)
    .replace('{{DRAFT}}', draft);
  const result = await chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    purpose: 'fix',
    label: trial,
    capUsd: config.capUsd,
    maxTokens: config.fixerChatMaxTokens,
    temperature: 0,
    seed: config.seed,
    reasoning: { effort: 'low' },
  });
  let text = stripEmoji(result.text.trim());
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\r?\n/, '').replace(/\r?\n```\s*$/, '');
  }
  if (text.length === 0) {
    return { fixerModel: model, exitCode: 1, durationMs: Date.now() - started, numTurns: 1, harnessCostUsd: result.costUsd, isError: true, resultTail: `empty response (finish: ${result.finishReason ?? '?'})` };
  }
  writeFileSync(draftPath(trial, sourceId), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return { fixerModel: model, exitCode: 0, durationMs: Date.now() - started, numTurns: 1, harnessCostUsd: result.costUsd, isError: false, resultTail: text.slice(-500) };
}

function fakeFixer(trial: string, sourceId: string): FixerResult {
  const draft = draftPath(trial, sourceId);
  const text = readFileSync(draft, 'utf8');
  writeFileSync(draft, text.replaceAll('game-changer', 'useful tool').replaceAll("In today's fast-paced world, ", ''), 'utf8');
  return { fixerModel: 'fake', exitCode: 0, durationMs: 1, numTurns: 1, harnessCostUsd: 0, isError: false, resultTail: 'fake fixer' };
}

export type { LintFinding };
