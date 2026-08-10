import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { aiStyle, RULE_METHODS } from '../../rulepack-ai-style/src/index.js';

const readJson = async (relative: string): Promise<Record<string, unknown>> => JSON.parse(
  await readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'),
) as Record<string, unknown>;

test('generated catalogue covers every published AI-style rule', async () => {
  const catalog = await readJson('../public/rules/index.json') as {
    schemaVersion: string;
    rules: Array<{ id: string; name: string; method: string; url: string }>;
  };
  assert.equal(catalog.schemaVersion, '1.0.0');
  assert.equal(catalog.rules.length, Object.keys(aiStyle.rules).length);
  assert.equal(new Set(catalog.rules.map((rule) => rule.id)).size, catalog.rules.length);
  for (const rule of catalog.rules) {
    assert.ok(aiStyle.rules[rule.name], `catalogue contains unknown rule ${rule.name}`);
    assert.equal(rule.method, RULE_METHODS[rule.name as keyof typeof RULE_METHODS]);
    assert.equal(rule.url, `https://slopsift.dev/rules/${rule.name}/`);
  }
});

test('versioned schema describes JSON and JSON Lines contracts', async () => {
  const schema = await readJson('../public/schemas/slopsift-result-v1.schema.json') as {
    $id: string;
    type: string;
    $defs: Record<string, unknown>;
  };
  assert.equal(schema.$id, 'https://slopsift.dev/schemas/slopsift-result-v1.schema.json');
  assert.equal(schema.type, 'array');
  assert.ok(schema.$defs.fileResult);
  assert.ok(schema.$defs.message);
  assert.ok(schema.$defs.standardAssessment);
  const assessment = schema.$defs.standardAssessment as {
    properties?: { status?: { enum?: string[] } };
    required?: string[];
  };
  assert.deepEqual(assessment.properties?.status?.enum, ['nonconformant', 'review-required']);
  assert.ok(assessment.required?.includes('reviewRequired'));
});

test('agent discovery files link to the machine contracts', async () => {
  const llms = await readFile(fileURLToPath(new URL('../public/llms.txt', import.meta.url)), 'utf8');
  assert.match(llms, /\/rules\/index\.json/);
  assert.match(llms, /\/schemas\/slopsift-result-v1\.schema\.json/);
  assert.match(llms, /Accept: text\/markdown/);
});
