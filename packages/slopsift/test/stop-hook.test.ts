import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import type { Lint } from 'writinglint-core';
import {
  defaultStopHookStateDirectory,
  parseStopHookEvent,
  runStopHook,
  stopHookFailure,
  type StopHookEvent,
} from '../src/stop-hook.js';

const execFile = promisify(execFileCallback);

const warning = (text = 'Kept deliberately: the explanation jumps ahead.'): Lint => ({
  ruleId: 'ai-style/agentless-rationale',
  category: 'agency',
  severity: 'warn',
  confidence: 'medium',
  start: 0,
  end: text.length,
  text,
  message: 'Name the subject before explaining the reason.',
});

const event = (overrides: Partial<StopHookEvent> = {}): StopHookEvent => ({
  session_id: 'session-123',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'Kept deliberately: the explanation jumps ahead.',
  ...overrides,
});

const engine = (lints: Lint[]) => ({
  async lintSource() {
    return { kind: 'prose' as const, lints, wordCount: 7 };
  },
});

const conditionalEngine = {
  async lintSource(_filePath: string, source: string) {
    const text = 'Kept deliberately: the explanation jumps ahead.';
    return {
      kind: 'prose' as const,
      lints: source.includes(text) ? [warning(text)] : [],
      wordCount: source.split(/\s+/).length,
    };
  },
};

test('Stop-hook parser accepts the shared Claude Code and Codex payloads', () => {
  assert.deepEqual(parseStopHookEvent({
    session_id: 'claude-session',
    transcript_path: '/tmp/claude.jsonl',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'The implementation is complete.',
  }), {
    session_id: 'claude-session',
    transcript_path: '/tmp/claude.jsonl',
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'The implementation is complete.',
    turn_id: undefined,
    cwd: undefined,
  });

  assert.equal(parseStopHookEvent({
    session_id: 'codex-session',
    turn_id: 'turn-456',
    hook_event_name: 'Stop',
    stop_hook_active: true,
    last_assistant_message: 'I changed the parser and ran its tests.',
  }).turn_id, 'turn-456');
  assert.throws(() => parseStopHookEvent({ hook_event_name: 'PostToolUse' }), /hook_event_name/);
});

test('Stop hook allows a clean response and clears retry state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-clean-'));
  try {
    const output = await runStopHook(engine([]), event({
      last_assistant_message: 'I changed the parser and ran its focused tests.',
    }), { stateDirectory: directory });
    assert.deepEqual(output, {});
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook blocks with concise findings and caps correction retries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-retry-'));
  try {
    const first = await runStopHook(engine([warning()]), event(), {
      stateDirectory: directory,
      maxRetries: 2,
      maxFindings: 1,
    });
    assert.equal(first.decision, 'block');
    assert.match(first.reason ?? '', /Rewrite the final response before stopping/);
    assert.match(first.reason ?? '', /warning at assistant response:1:1 — ai-style\/agentless-rationale/);
    assert.match(first.reason ?? '', /Keep every fact, command, link, caveat, and file reference/);
    assert.match(first.reason ?? '', /Address the reason for each finding/);

    const second = await runStopHook(engine([warning()]), event({ stop_hook_active: true }), {
      stateDirectory: directory,
      maxRetries: 2,
    });
    assert.equal(second.decision, 'block');

    const capped = await runStopHook(engine([warning()]), event({ stop_hook_active: true }), {
      stateDirectory: directory,
      maxRetries: 2,
    });
    assert.equal(capped.decision, undefined);
    assert.match(capped.systemMessage ?? '', /allowed through to avoid an infinite loop/);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook tells the user when an automatic rewrite passes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-accepted-'));
  try {
    await runStopHook(engine([warning()]), event(), { stateDirectory: directory });
    const accepted = await runStopHook(engine([]), event({
      stop_hook_active: true,
      last_assistant_message: 'The workflow limits concurrency because focused prompts improve the evidence search.',
    }), { stateDirectory: directory });
    assert.deepEqual(accepted, {
      systemMessage: 'SlopSift accepted the response after 1 automatic rewrite.',
    });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook limits model-visible findings and handles empty responses', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-findings-'));
  try {
    const output = await runStopHook(engine([
      warning('First compressed explanation.'),
      { ...warning('Second compressed explanation.'), ruleId: 'ai-style/implementation-detail-pileup' },
    ]), event(), { stateDirectory: directory, maxFindings: 1 });
    assert.match(output.reason ?? '', /1 additional finding omitted/);

    const empty = await runStopHook(engine([warning()]), event({
      stop_hook_active: true,
      last_assistant_message: null,
    }), { stateDirectory: directory });
    assert.deepEqual(empty, {
      systemMessage: 'SlopSift accepted the response after 1 automatic rewrite.',
    });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook state prefers explicit and plugin-owned directories', () => {
  assert.equal(defaultStopHookStateDirectory({
    SLOPSIFT_HOOK_STATE_DIR: '/tmp/explicit-state',
    PLUGIN_DATA: '/tmp/plugin-data',
  }), '/tmp/explicit-state');
  assert.equal(defaultStopHookStateDirectory({ PLUGIN_DATA: '/tmp/plugin-data' }), '/tmp/plugin-data/slopsift-stop-hook');
  assert.equal(defaultStopHookStateDirectory({ CLAUDE_PLUGIN_DATA: '/tmp/claude-data' }), '/tmp/claude-data/slopsift-stop-hook');
});

test('Stop hook can ask the agent to edit prose in its dirty Git tree', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-dirty-'));
  const stateDirectory = join(directory, 'state');
  try {
    await execFile('git', ['init', '--quiet'], { cwd: directory });
    await mkdir(join(directory, 'docs'));
    await writeFile(join(directory, 'docs', 'notes.md'), 'Kept deliberately: the explanation jumps ahead.\n', 'utf8');
    const output = await runStopHook(conditionalEngine, event({
      last_assistant_message: 'I updated the documentation and ran its test.',
      cwd: directory,
    }), {
      includeDirty: true,
      stateDirectory,
    });
    assert.equal(output.decision, 'block');
    assert.match(output.reason ?? '', /Edit the listed files/);
    assert.match(output.reason ?? '', /docs\/notes\.md:1:1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook can use active-turn transcript prose as correction context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-stop-transcript-'));
  const transcriptPath = join(directory, 'session.jsonl');
  try {
    await writeFile(transcriptPath, [
      JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Explain it.' }] } }),
      JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Kept deliberately: the explanation jumps ahead.' }] } }),
      '',
    ].join('\n'), 'utf8');
    const output = await runStopHook(conditionalEngine, event({
      last_assistant_message: 'I explained why the implementation keeps the existing limit.',
      transcript_path: transcriptPath,
    }), {
      includeTranscript: true,
      stateDirectory: join(directory, 'state'),
    });
    assert.equal(output.decision, 'block');
    assert.match(output.reason ?? '', /without repeating the transcript problems/);
    assert.match(output.reason ?? '', /session\.jsonl#record-2:1:1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Stop hook runtime failures fail open with a visible message', () => {
  assert.deepEqual(stopHookFailure(new Error('model missing')), {
    systemMessage: 'SlopSift could not validate the final response and allowed it through: model missing',
  });
});
