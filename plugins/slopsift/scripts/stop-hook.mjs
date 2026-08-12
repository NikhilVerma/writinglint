#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pluginPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const input = await new Promise((resolve, reject) => {
  let source = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { source += chunk; });
  process.stdin.on('end', () => resolve(source));
  process.stdin.on('error', reject);
});

const options = ['hook', 'stop'];
const valueOption = (envName, flag) => {
  const value = process.env[envName];
  if (value) options.push(flag, value);
};
const requestedLevel = process.env.SLOPSIFT_HOOK_LEVEL;
if (requestedLevel === 'warning' || requestedLevel === 'error') {
  options.push('--level', requestedLevel);
}
const configuredRulepacks = (process.env.SLOPSIFT_HOOK_RULEPACKS || '').split(',').map((value) => value.trim()).filter(Boolean);
const rulepacks = configuredRulepacks.length > 0 ? configuredRulepacks : ['ai-style', 'reader-first'];
for (const rulepack of rulepacks) {
  options.push('--rulepack', rulepack);
}
options.push('--feedback', process.env.SLOPSIFT_HOOK_FEEDBACK || 'compact');
valueOption('SLOPSIFT_HOOK_MAX_RETRIES', '--max-retries');
valueOption('SLOPSIFT_HOOK_MAX_FINDINGS', '--max-findings');
valueOption('SLOPSIFT_HOOK_MAX_DIRTY_FILES', '--max-dirty-files');
valueOption('SLOPSIFT_HOOK_MAX_TRANSCRIPT_MESSAGES', '--max-transcript-messages');
valueOption('SLOPSIFT_HOOK_STATE_DIR', '--state-dir');
valueOption('SLOPSIFT_MODEL', '--model');
if (process.env.SLOPSIFT_HOOK_INCLUDE_DIRTY === '1') options.push('--include-dirty');
if (process.env.SLOPSIFT_HOOK_INCLUDE_TRANSCRIPT === '1') options.push('--include-transcript');
if (process.env.SLOPSIFT_HOOK_NO_DOWNLOAD === '1') options.push('--no-download');

const localCli = process.env.SLOPSIFT_HOOK_CLI;
const command = localCli ? process.execPath : (process.env.SLOPSIFT_HOOK_NPX || 'npx');
const args = localCli ? [localCli, ...options] : ['--yes', `slopsift@${pluginPackage.version}`, ...options];
const result = spawnSync(command, args, {
  input,
  encoding: 'utf8',
  timeout: 230_000,
  maxBuffer: 16 * 1024 * 1024,
});

function failOpen(message) {
  process.stdout.write(`${JSON.stringify({
    systemMessage: `SlopSift could not validate the final response and allowed it through: ${message}`,
  })}\n`);
}

if (result.error) {
  failOpen(result.error.message);
} else {
  const output = result.stdout.trim();
  try {
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('hook output was not an object');
    process.stdout.write(`${JSON.stringify(parsed)}\n`);
  } catch {
    const detail = result.stderr.trim() || `slopsift exited ${result.status ?? 'without a status'}`;
    failOpen(detail.slice(0, 500));
  }
}
