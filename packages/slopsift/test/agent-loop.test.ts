import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Lint } from 'writinglint-core';
import {
  AGENT_DEMO_DRAFT,
  inspectAgentHost,
  runAgentDemo,
  type AgentCommandRunner,
} from '../src/agent-loop.js';

const warning = (): Lint => ({
  ruleId: 'ai-style/agentless-rationale',
  category: 'agency',
  severity: 'warn',
  confidence: 'medium',
  start: 0,
  end: AGENT_DEMO_DRAFT.length,
  text: AGENT_DEMO_DRAFT,
  message: 'Name the subject before explaining the reason.',
});

test('Claude Code doctor recognizes an enabled SlopSift plugin', () => {
  const run: AgentCommandRunner = (_command, args) => args[0] === '--version'
    ? { status: 0, stdout: '2.1.226 (Claude Code)\n', stderr: '' }
    : {
        status: 0,
        stdout: JSON.stringify([{ id: 'slopsift@slopsift', version: '0.6.0', enabled: true }]),
        stderr: '',
      };
  const inspection = inspectAgentHost('claude-code', run);
  assert.equal(inspection.installed, true);
  assert.equal(inspection.pluginState, 'ready');
  assert.equal(inspection.pluginVersion, '0.6.0');
});

test('Codex doctor reports an installed client whose plugin is missing', () => {
  const run: AgentCommandRunner = (_command, args) => args[0] === '--version'
    ? { status: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' }
    : { status: 0, stdout: JSON.stringify({ installed: [], available: [] }), stderr: '' };
  const inspection = inspectAgentHost('codex', run);
  assert.equal(inspection.installed, true);
  assert.equal(inspection.pluginState, 'missing');
  assert.match(inspection.installCommands.join('\n'), /codex plugin add slopsift@slopsift/);
});

test('agent doctor preserves plugin-list failures as an unknown state', () => {
  const run: AgentCommandRunner = (_command, args) => args[0] === '--version'
    ? { status: 0, stdout: 'codex-cli 0.147.0\n', stderr: '' }
    : { status: 0, stdout: '{broken', stderr: '' };
  const inspection = inspectAgentHost('codex', run);
  assert.equal(inspection.pluginState, 'unknown');
  assert.match(inspection.detail ?? '', /JSON/);
});

test('agent demo rejects its bad draft and accepts the clean rewrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-agent-loop-test-'));
  try {
    const demo = await runAgentDemo({
      async lintSource(_filePath, source) {
        return {
          kind: 'prose' as const,
          lints: source === AGENT_DEMO_DRAFT ? [warning()] : [],
          wordCount: source.split(/\s+/).length,
        };
      },
    }, directory);
    assert.equal(demo.rejectedDraft.decision, 'block');
    assert.match(demo.rejectedDraft.reason ?? '', /ai-style\/agentless-rationale \[warning\] ×1/);
    assert.match(demo.acceptedRewrite.systemMessage ?? '', /accepted the response after 1 automatic rewrite/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
