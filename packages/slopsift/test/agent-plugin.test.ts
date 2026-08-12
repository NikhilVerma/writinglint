import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const runner = join(root, 'plugins/slopsift/scripts/stop-hook.mjs');

test('agent plugin runner forwards opt-in evidence flags and emits only hook JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-plugin-runner-'));
  const fakeCli = join(directory, 'fake-cli.mjs');
  try {
    await writeFile(fakeCli, [
      "process.stdin.resume();",
      "process.stdin.on('end', () => console.log(JSON.stringify({ decision: 'block', reason: process.argv.slice(2).join(' ') })));",
      '',
    ].join('\n'), 'utf8');
    const result = spawnSync(process.execPath, [runner], {
      input: '{}',
      encoding: 'utf8',
      env: {
        ...process.env,
        SLOPSIFT_HOOK_CLI: fakeCli,
        SLOPSIFT_HOOK_INCLUDE_DIRTY: '1',
        SLOPSIFT_HOOK_INCLUDE_TRANSCRIPT: '1',
        SLOPSIFT_HOOK_MAX_DIRTY_FILES: '12',
        SLOPSIFT_HOOK_LEVEL: 'info',
        SLOPSIFT_HOOK_RULEPACKS: 'ai-style, reader-first',
        SLOPSIFT_HOOK_FEEDBACK: 'detailed',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { decision?: string; reason?: string };
    assert.equal(output.decision, 'block');
    assert.match(output.reason ?? '', /hook stop/);
    assert.match(output.reason ?? '', /--include-dirty/);
    assert.match(output.reason ?? '', /--include-transcript/);
    assert.match(output.reason ?? '', /--max-dirty-files 12/);
    assert.match(output.reason ?? '', /--rulepack ai-style --rulepack reader-first/);
    assert.match(output.reason ?? '', /--feedback detailed/);
    assert.doesNotMatch(output.reason ?? '', /--level info/);
    assert.equal(result.stdout.trim().split('\n').length, 1);

    const errorsOnly = spawnSync(process.execPath, [runner], {
      input: '{}',
      encoding: 'utf8',
      env: {
        ...process.env,
        SLOPSIFT_HOOK_CLI: fakeCli,
        SLOPSIFT_HOOK_LEVEL: 'error',
      },
    });
    assert.equal(errorsOnly.status, 0, errorsOnly.stderr);
    const errorsOnlyOutput = JSON.parse(errorsOnly.stdout) as { reason?: string };
    assert.match(errorsOnlyOutput.reason ?? '', /--level error/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('agent plugin runner fails open when its child does not return JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-plugin-failure-'));
  const fakeCli = join(directory, 'fake-cli.mjs');
  try {
    await writeFile(fakeCli, "console.log('not json');\n", 'utf8');
    const result = spawnSync(process.execPath, [runner], {
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, SLOPSIFT_HOOK_CLI: fakeCli },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { systemMessage?: string };
    assert.match(output.systemMessage ?? '', /allowed it through/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('shared hook manifest invokes the packaged runner', async () => {
  const hooks = JSON.parse(await readFile(join(root, 'plugins/slopsift/hooks/hooks.json'), 'utf8')) as {
    hooks: { Stop: Array<{ hooks: Array<{ command: string; type: string }> }> };
  };
  assert.deepEqual(hooks.hooks.Stop[0]?.hooks[0], {
    type: 'command',
    command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/stop-hook.mjs"',
    timeout: 240,
  });
});
