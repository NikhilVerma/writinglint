import assert from 'node:assert/strict';
import test from 'node:test';
import { Linter } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { configForRulepackPreset } from '../src/client/rulepack-config.js';
import {
  emptyResultFor,
  normalizeRulepackPreset,
  RULEPACK_PRESETS,
  ruleUrl,
  statusForResult,
} from '../src/client/rulepack-selection.js';

test('browser surfaces expose AI-style, reader-first, and the recommended combination', () => {
  assert.deepEqual(RULEPACK_PRESETS.map(({ value }) => value), ['combined', 'ai-style', 'reader-first']);
  assert.equal(normalizeRulepackPreset('reader-first'), 'reader-first');
  assert.equal(normalizeRulepackPreset('unknown'), 'combined');
  assert.equal(normalizeRulepackPreset(undefined), 'combined');
});

test('browser status describes findings without external conformance claims', () => {
  assert.equal(statusForResult([]), '0 findings found');
  assert.equal(statusForResult([{}]), '1 finding found');
  assert.deepEqual(emptyResultFor(), {
    title: 'No problems found.',
    detail: 'This draft reads clean to the active rules.',
  });
});

test('finding links route both first-party packs to SlopSift rule pages', () => {
  assert.equal(ruleUrl('reader-first/sentence-load'), 'https://slopsift.dev/rules/sentence-load/');
  assert.equal(ruleUrl('ai-style/ai-vocabulary'), 'https://slopsift.dev/rules/ai-vocabulary/');
});

test('each browser preset resolves to the configuration named by the dropdown', async () => {
  const linter = new Linter(await loadParser());
  const text = 'As an AI language model, the MCP starts the service. The MCP reads the settings.';
  const ai = await linter.lint(text, configForRulepackPreset('ai-style'));
  assert.ok(ai.lints.some(({ ruleId }) => ruleId.startsWith('ai-style/')));
  assert.ok(ai.lints.every(({ ruleId }) => !ruleId.startsWith('reader-first/')));

  const reader = await linter.lint(text, configForRulepackPreset('reader-first'));
  assert.ok(reader.lints.some(({ ruleId }) => ruleId === 'reader-first/unexplained-initialism'));
  assert.ok(reader.lints.every(({ ruleId }) => !ruleId.startsWith('ai-style/')));

  const combined = await linter.lint(text, configForRulepackPreset('combined'));
  assert.ok(combined.lints.some(({ ruleId }) => ruleId.startsWith('ai-style/')));
  assert.ok(combined.lints.some(({ ruleId }) => ruleId.startsWith('reader-first/')));
});
