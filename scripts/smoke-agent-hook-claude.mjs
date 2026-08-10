import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'packages/slopsift/dist/cli.js');
const plugin = join(root, 'plugins/slopsift');
const model = process.env.SLOPSIFT_CLAUDE_MODEL;
if (!model) {
  throw new Error('Set SLOPSIFT_CLAUDE_MODEL to the Claude Code model used for this paid live test.');
}

const prompt = [
  'For this hook test, first answer with exactly the sentence below.',
  'If a Stop hook asks you to revise it, follow the hook and preserve the meaning.',
  '',
  'Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.',
].join('\n');

const result = spawnSync('claude', [
  '-p',
  '--verbose',
  '--plugin-dir', plugin,
  '--model', model,
  '--max-budget-usd', process.env.SLOPSIFT_CLAUDE_MAX_BUDGET ?? '0.50',
  '--no-session-persistence',
  '--permission-mode', 'dontAsk',
  '--output-format', 'stream-json',
  '--include-hook-events',
  prompt,
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SLOPSIFT_HOOK_CLI: cli },
  timeout: 300_000,
  maxBuffer: 32 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr);

const events = result.stdout.split('\n').flatMap((line) => {
  if (!line.trim()) return [];
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
});
const hookOutputs = events
  .filter((event) => event.type === 'system' && event.subtype === 'hook_response')
  .map((event) => event.output ?? '');
assert.ok(hookOutputs.some((output) => output.includes('"decision":"block"')), 'expected the first draft to be rejected');
assert.ok(hookOutputs.some((output) => output.includes('accepted the response after 1 automatic rewrite')), 'expected the rewrite to be accepted');

const final = events.findLast((event) => event.type === 'result');
assert.equal(final?.is_error, false);
assert.equal(final?.num_turns, 2);
assert.notEqual(final?.result?.trim(), 'Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.');
console.log(`live Claude Code hook test passed in two turns (cost: $${final?.total_cost_usd ?? 'unknown'})`);
