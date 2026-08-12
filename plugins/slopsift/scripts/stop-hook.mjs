#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

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
for (const rulepack of (process.env.SLOPSIFT_HOOK_RULEPACKS || '').split(',').map((value) => value.trim()).filter(Boolean)) {
  options.push('--rulepack', rulepack);
}
valueOption('SLOPSIFT_HOOK_FEEDBACK', '--feedback');
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
const args = localCli ? [localCli, ...options] : ['--yes', 'slopsift@0.7.0', ...options];
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
