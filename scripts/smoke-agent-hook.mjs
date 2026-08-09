import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'packages/slopsift/dist/cli.js');
const runner = join(root, 'plugins/slopsift/scripts/stop-hook.mjs');
const stateDirectory = await mkdtemp(join(tmpdir(), 'slopsift-agent-hook-'));

try {
  const input = JSON.stringify({
    session_id: 'packed-hook-smoke',
    turn_id: 'turn-1',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.',
    cwd: root,
  });
  const result = spawnSync(process.execPath, [runner], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      SLOPSIFT_HOOK_CLI: cli,
      SLOPSIFT_HOOK_STATE_DIR: stateDirectory,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, 'block');
  assert.match(output.reason, /ai-style\/agentless-rationale/);

  const hooks = JSON.parse(await readFile(join(root, 'plugins/slopsift/hooks/hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.Stop[0].hooks[0].type, 'command');
  for (const manifest of [
    '.agents/plugins/marketplace.json',
    '.claude-plugin/marketplace.json',
    'plugins/slopsift/.codex-plugin/plugin.json',
    'plugins/slopsift/.claude-plugin/plugin.json',
  ]) {
    JSON.parse(await readFile(join(root, manifest), 'utf8'));
  }

  await build({
    entryPoints: [join(root, 'plugins/slopsift/extensions/pi.ts')],
    outfile: join(stateDirectory, 'pi-extension.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  console.log('agent hook smoke test passed');
} finally {
  await rm(stateDirectory, { recursive: true, force: true });
}
