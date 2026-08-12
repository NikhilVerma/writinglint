import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { aiStyle, RULE_METHODS } from '../../rulepack-ai-style/src/index.js';
import { readerFirst } from '../../rulepack-reader-first/src/index.js';

const readJson = async (relative: string): Promise<Record<string, unknown>> => JSON.parse(
  await readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'),
) as Record<string, unknown>;

test('generated catalogue covers every published SlopSift rule', async () => {
  const catalog = await readJson('../public/rules/index.json') as {
    schemaVersion: string;
    rules: Array<{ id: string; name: string; method: string; url: string }>;
  };
  assert.equal(catalog.schemaVersion, '1.0.0');
  assert.equal(catalog.rules.length, Object.keys(aiStyle.rules).length + Object.keys(readerFirst.rules).length);
  assert.equal(new Set(catalog.rules.map((rule) => rule.id)).size, catalog.rules.length);
  for (const rule of catalog.rules) {
    if (rule.id.startsWith('ai-style/')) {
      assert.ok(aiStyle.rules[rule.name], `catalogue contains unknown AI-style rule ${rule.name}`);
      assert.equal(rule.method, RULE_METHODS[rule.name as keyof typeof RULE_METHODS]);
    } else {
      assert.ok(readerFirst.rules[rule.name], `catalogue contains unknown reader-first rule ${rule.name}`);
    }
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
});

test('agent discovery files link to the machine contracts', async () => {
  const llms = await readFile(fileURLToPath(new URL('../public/llms.txt', import.meta.url)), 'utf8');
  assert.match(llms, /\/rules\/index\.json/);
  assert.match(llms, /\/schemas\/slopsift-result-v1\.schema\.json/);
  assert.match(llms, /Accept: text\/markdown/);
  const full = await readFile(fileURLToPath(new URL('../public/llms-full.txt', import.meta.url)), 'utf8');
  assert.match(full, /## CLI/);
  assert.match(full, /## In-process API/);
  assert.match(full, /## Stop hook/);
  assert.match(full, /--rulepack ai-style --rulepack reader-first/);
});
