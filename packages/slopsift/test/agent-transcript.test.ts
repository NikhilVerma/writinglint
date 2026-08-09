import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readCurrentTurnTranscript } from '../src/agent-transcript.js';

async function withTranscript(records: unknown[], run: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-transcript-'));
  const path = join(directory, 'session.jsonl');
  try {
    await writeFile(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n{unfinished`, 'utf8');
    await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('reads Claude Code assistant text after the latest human prompt', async () => {
  await withTranscript([
    { type: 'user', message: { role: 'user', content: 'old prompt' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'old response' }] } },
    { type: 'user', message: { role: 'user', content: 'new prompt' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'current response' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'tool output' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'final response' }] } },
  ], async (path) => {
    assert.deepEqual(await readCurrentTurnTranscript(path), [
      { record: 4, text: 'current response' },
      { record: 6, text: 'final response' },
    ]);
  });
});

test('uses the Codex turn id to isolate response-item output text', async () => {
  await withTranscript([
    { type: 'turn_context', payload: { turn_id: 'old' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'old response' }] } },
    { type: 'turn_context', payload: { turn_id: 'turn-2' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'current response' }] } },
  ], async (path) => {
    assert.deepEqual(await readCurrentTurnTranscript(path, { turnId: 'turn-2' }), [
      { record: 4, text: 'current response' },
    ]);
  });
});

test('does not fall back to old Codex turns when the requested turn is absent', async () => {
  await withTranscript([
    { type: 'turn_context', payload: { turn_id: 'old' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'old response' }] } },
  ], async (path) => {
    await assert.rejects(readCurrentTurnTranscript(path, { turnId: 'missing' }), /could not find Codex turn missing/);
  });
});

test('reads Pi assistant text after the latest user message', async () => {
  await withTranscript([
    { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'prompt' }] } },
    { type: 'message', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'Pi response' }] } },
  ], async (path) => {
    assert.deepEqual(await readCurrentTurnTranscript(path), [{ record: 2, text: 'Pi response' }]);
  });
});
