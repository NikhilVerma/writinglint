import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Linter } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import type {
  AsdSte100Issue9Assessment,
  AsdSte100Issue9StandardData,
} from 'writinglint-rulepack-technical-english';
import { configForRulepackPreset } from '../src/client/rulepack-config.js';
import {
  emptyResultFor,
  normalizeRulepackPreset,
  RULEPACK_PRESETS,
  ruleUrl,
  statusForResult,
} from '../src/client/rulepack-selection.js';

const assessment = (
  status: AsdSte100Issue9Assessment['status'],
  automatedRuleFindings: number,
  standardDataLoaded = false,
): AsdSte100Issue9Assessment => ({
  standard: 'ASD-STE100',
  issue: 9,
  publicationDate: '2025-01-15',
  status,
  automatedRuleFindings,
  automatedRules: ['4.2'],
  executedRules: ['4.2'],
  standardData: { loaded: standardDataLoaded },
  reviewRequired: ['Controlled dictionary'],
  disclaimer: 'Independent partial check.',
});

test('technical-English clean status says when local dictionary checks actually ran', () => {
  const status = statusForResult([], assessment('review-required', 0, true));
  assert.match(status, /local dictionary checks ran/i);
  assert.doesNotMatch(status, /dictionary and human review are still required/i);
  const empty = emptyResultFor('asd-ste100-procedural', assessment('review-required', 0, true));
  assert.match(empty.detail, /local dictionary checks ran/i);
});

test('browser surfaces expose the same three rulepack presets', () => {
  assert.deepEqual(RULEPACK_PRESETS.map(({ value }) => value), [
    'ai-style',
    'asd-ste100-descriptive',
    'asd-ste100-procedural',
  ]);
  assert.equal(normalizeRulepackPreset('asd-ste100-procedural'), 'asd-ste100-procedural');
  assert.equal(normalizeRulepackPreset('unknown'), 'ai-style');
  assert.equal(normalizeRulepackPreset(undefined), 'ai-style');
});

test('technical-English status never calls an automated clean run compliant', () => {
  const status = statusForResult([], assessment('review-required', 0));
  assert.match(status, /human review.*required/i);
  assert.doesNotMatch(status, /compliant|conformant|passed/i);

  const empty = emptyResultFor('asd-ste100-descriptive', assessment('review-required', 0));
  assert.match(`${empty.title} ${empty.detail}`, /dictionary.*human review/i);
  assert.doesNotMatch(`${empty.title} ${empty.detail}`, /compliant|conformant|passed/i);
});

test('technical-English status distinguishes warnings from nonconformance', () => {
  assert.match(
    statusForResult([{ severity: 'warn' }], assessment('review-required', 1)),
    /review required: 1 automated finding/i,
  );
  assert.match(
    statusForResult([{ severity: 'error' }], assessment('nonconformant', 1)),
    /nonconformant: 1 automated finding/i,
  );
});

test('finding links route technical rules to the standard owner', () => {
  assert.equal(ruleUrl('technical-english/no-semicolon'), 'https://www.asd-ste100.org/');
  assert.equal(ruleUrl('ai-style/ai-vocabulary'), 'https://slopsift.dev/rules/ai-vocabulary/');
});

test('each browser preset resolves to the configuration named by the dropdown', async () => {
  const linter = new Linter(await loadParser());
  const ai = await linter.lint('As an AI language model, I can help.', configForRulepackPreset('ai-style'));
  assert.ok(ai.lints.some(({ ruleId }) => ruleId.startsWith('ai-style/')));
  assert.ok(ai.lints.every(({ ruleId }) => !ruleId.startsWith('technical-english/')));

  const punctuation = await linter.lint('Open the valve; inspect the seal.', configForRulepackPreset('asd-ste100-descriptive'));
  assert.ok(punctuation.lints.some(({ ruleId }) => ruleId === 'technical-english/no-semicolon'));
  assert.ok(punctuation.lints.every(({ ruleId }) => !ruleId.startsWith('ai-style/')));

  const sentence = 'Inspect the primary hydraulic pump housing carefully before you disconnect the pressure line from the forward service manifold during scheduled maintenance.';
  const descriptive = await linter.lint(sentence, configForRulepackPreset('asd-ste100-descriptive'));
  const procedural = await linter.lint(sentence, configForRulepackPreset('asd-ste100-procedural'));
  assert.equal(descriptive.lints.some(({ ruleId }) => ruleId.endsWith('/sentence-length')), false);
  assert.equal(procedural.lints.some(({ ruleId }) => ruleId.endsWith('/sentence-length')), true);
});

test('browser configuration enables dictionary checks only after local standard data loads', async () => {
  const data = {
    schemaVersion: 1,
    standard: 'ASD-STE100',
    issue: 9,
    source: { filename: 'local.pdf', pages: 434, doclingJsonSha256: 'd'.repeat(64), parserVersion: 'test' },
    rules: [],
    terminology: {
      provider: 'user-supplied-asd-ste100-issue-9',
      approvedEntries: 875,
      entries: [{
        headword: 'utilize',
        approved: false,
        partOfSpeech: 'verb',
        forms: [],
        source: { ref: '#/test', page: 420 },
      }],
    },
  } as AsdSte100Issue9StandardData;
  const linter = new Linter(await loadParser());
  const withoutData = await linter.lint('Utilize the tool.', configForRulepackPreset('asd-ste100-procedural'));
  const withData = await linter.lint('Utilize the tool.', configForRulepackPreset('asd-ste100-procedural', data));
  assert.equal(withoutData.lints.some(({ ruleId }) => ruleId.endsWith('/dictionary-word-approval')), false);
  assert.equal(withData.lints.some(({ ruleId }) => ruleId.endsWith('/dictionary-word-approval')), true);
});

test('main editor and full editor both expose a local standard-data loader', () => {
  for (const page of ['../src/pages/index.astro', '../src/pages/editor.astro']) {
    const source = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.match(source, /TechnicalStandardData/u);
  }
  const component = readFileSync(new URL('../src/components/TechnicalStandardData.astro', import.meta.url), 'utf8');
  assert.match(component, /data-standard-data-input/u);
  assert.match(component, /Load local standard data/u);
});
