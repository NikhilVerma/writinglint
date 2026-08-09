import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const missing = '__slopsift_intentionally_missing__/**/*.md';
const sloppy = fileURLToPath(new URL('./fixtures/high-confidence.md', import.meta.url));
const compressedTechnical = [1, 2, 3, 4, 5, 6].map((index) =>
  fileURLToPath(new URL(`./fixtures/compressed-technical-${index}.ts`, import.meta.url)));

function run(...args: string[]) {
  return spawnSync(process.execPath, ['--conditions=source', '--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
  });
}

test('unmatched patterns fail loudly by default', () => {
  const result = run(missing);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no supported files matched/);
  assert.match(result.stderr, /--no-error-on-unmatched-pattern/);
});

test('unmatched patterns can be optional without loading the model', () => {
  const result = run(missing, '--no-error-on-unmatched-pattern', '--format', 'json');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test('exit-zero neutralizes lint findings but not runtime failures', () => {
  const failing = run(sloppy, '--level', 'error');
  assert.equal(failing.status, 1, failing.stderr);

  const advisory = run(sloppy, '--level', 'error', '--exit-zero');
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.match(advisory.stdout, /error/);

  const runtimeFailure = run(missing, '--exit-zero');
  assert.equal(runtimeFailure.status, 2);
});

test('GitHub format emits native annotations for CI', () => {
  const result = run(sloppy, '--level', 'error', '--format', 'github');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error file=.*high-confidence\.md,line=\d+,col=\d+,endLine=\d+,endColumn=\d+,title=ai-style\//);
});

test('compressed technical comment regressions all produce a default warning', () => {
  const result = run(...compressedTechnical, '--format', 'json', '--exit-zero');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as Array<{
    filePath: string;
    messages: Array<{ ruleId: string; level: string }>;
  }>;
  assert.equal(output.length, compressedTechnical.length);
  const expectedRules = [
    'ai-style/implementation-detail-pileup',
    'ai-style/implementation-detail-pileup',
    'ai-style/implementation-detail-pileup',
    'ai-style/negative-contrast',
    'ai-style/agentless-rationale',
    'ai-style/implementation-detail-pileup',
  ];
  for (const [index, entry] of output.entries()) {
    assert.ok(
      entry.messages.some((message) =>
        message.ruleId === expectedRules[index] && message.level === 'warn'),
      `${entry.filePath} should report ${expectedRules[index]}`,
    );
  }
});

test('a large Markdown table does not abort a multi-file JSON run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-table-'));
  try {
    const table = [
      '| Rule | Description | Example |',
      '| --- | --- | --- |',
      ...Array.from(
        { length: 45 },
        (_, index) => `| rule-${index} | This short cell explains local behavior number ${index} without becoming a prose sentence | This example remains deliberately brief and concrete |`,
      ),
    ].join('\n');
    const tableFile = join(directory, 'README.md');
    writeFileSync(tableFile, table);

    const result = run(tableFile, sloppy, '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as Array<{
      filePath: string;
      messages: Array<{ ruleId: string }>;
      wordCount: number;
    }>;
    assert.equal(output.length, 2);
    assert.ok(output.find((entry) => entry.filePath === tableFile)?.wordCount! > 300);
    assert.ok(output.find((entry) => entry.filePath.endsWith('high-confidence.md'))?.messages.length);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an explicitly selected supported file reports zero extracted prose', () => {
  const directory = mkdtempSync(join(tmpdir(), 'slopsift-empty-'));
  try {
    const codeFile = join(directory, 'empty.ts');
    writeFileSync(codeFile, 'export const answer = 42;\n');

    const result = run(codeFile, '--ext', '.ts', '--format', 'json', '--exit-zero');
    assert.equal(result.status, 0, result.stderr);
    const [output] = JSON.parse(result.stdout) as Array<{
      messages: Array<{ ruleId: string; level: string }>;
      wordCount: number;
    }>;
    assert.equal(output?.wordCount, 0);
    assert.deepEqual(output?.messages.map(({ ruleId, level }) => ({ ruleId, level })), [{
      ruleId: 'slopsift/no-extractable-prose',
      level: 'info',
    }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
