import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = dirname(fileURLToPath(import.meta.url));
const installed = JSON.parse(await readFile(join(root, 'node_modules/slopsift/package.json'), 'utf8'));
if (process.env.EXPECTED_PACKAGE_VERSION) {
  assert.equal(installed.version, process.env.EXPECTED_PACKAGE_VERSION);
}

const installedParser = JSON.parse(await readFile(join(root, 'node_modules/writinglint-parser-node/package.json'), 'utf8'));
if (process.env.EXPECTED_PARSER_VERSION) {
  assert.equal(installedParser.version, process.env.EXPECTED_PARSER_VERSION);
}

const requireFromSlopSift = createRequire(join(root, 'node_modules/slopsift/package.json'));
const rulepackEntry = requireFromSlopSift.resolve('writinglint-rulepack-ai-style');
const installedRulepack = JSON.parse(await readFile(join(dirname(rulepackEntry), '..', 'package.json'), 'utf8'));
if (process.env.EXPECTED_RULEPACK_VERSION) {
  assert.equal(installedRulepack.version, process.env.EXPECTED_RULEPACK_VERSION);
}

const readerFirstRulepackEntry = requireFromSlopSift.resolve('writinglint-rulepack-reader-first');
const installedReaderFirstRulepack = JSON.parse(
  await readFile(join(dirname(readerFirstRulepackEntry), '..', 'package.json'), 'utf8'),
);
if (process.env.EXPECTED_READER_FIRST_RULEPACK_VERSION) {
  assert.equal(installedReaderFirstRulepack.version, process.env.EXPECTED_READER_FIRST_RULEPACK_VERSION);
}

const parser = join(root, 'node_modules/writinglint-parser-node/model/parser.onnx');
assert.equal((await stat(parser)).size, 11_877_081, 'the transitive npm package must contain the parser');

const catalogue = JSON.parse(await readFile(requireFromSlopSift.resolve('slopsift/rules'), 'utf8'));
assert.equal(catalogue.schemaVersion, '1.0.0');
assert.ok(catalogue.rules.some((rule) => rule.id === 'ai-style/false-agency'));
const outputSchema = JSON.parse(await readFile(requireFromSlopSift.resolve('slopsift/schema/result-v1.json'), 'utf8'));
assert.equal(outputSchema.$id, 'https://slopsift.dev/schemas/slopsift-result-v1.schema.json');

const cli = join(root, 'node_modules/slopsift/dist/cli.js');
const result = spawnSync(process.execPath, [
  cli,
  'sloppy.md',
  '--level', 'info',
  '--format', 'json',
  '--no-download',
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    XDG_CACHE_HOME: join(root, '.empty-cache'),
    SLOPSIFT_MODEL_BASE_URL: 'http://127.0.0.1:9',
  },
});

assert.ok(result.status === 0 || result.status === 1, result.stderr || `unexpected exit ${result.status}`);
const reports = JSON.parse(result.stdout);
assert.equal(reports.length, 1);
assert.ok(reports[0].messages.every((message) => message.ruleUrl?.startsWith('https://slopsift.dev/rules/')));
const rules = reports[0].messages.map((message) => message.ruleId);
const emerging = reports[0].messages.filter((message) => message.ruleId === 'ai-style/emerging-slop-phrases');
assert.equal(emerging.length, 2, 'expected the emerging phrases, but not the literal load-bearing wall');
assert.ok(emerging.every((message) => message.level === 'info' && message.confidence === 'low'));
assert.equal(
  reports[0].messages.filter((message) => message.ruleId === 'ai-style/corrective-antithesis').length,
  1,
  `expected the clause-level "X, not Y" construction from rulepack ${installedRulepack.version}; received ${JSON.stringify(rules)}`,
);

const readerFile = join(root, 'reader.md');
await writeFile(readerFile, 'The MCP starts the service. The MCP reads the settings.\n');
const reader = spawnSync(process.execPath, [
  cli,
  readerFile,
  '--rulepack', 'reader-first',
  '--format', 'json',
  '--exit-zero',
  '--no-download',
], { cwd: root, encoding: 'utf8' });
assert.equal(reader.status, 0, reader.stderr);
const [readerReport] = JSON.parse(reader.stdout);
assert.deepEqual(
  new Set(readerReport.messages.map((message) => message.ruleId)),
  new Set(['reader-first/unexplained-initialism']),
);
assert.equal(
  reports[0].messages.filter((message) => message.ruleId === 'ai-style/stepwise-sequencing').length,
  1,
  `expected the graph-backed "X then Y" construction; received ${JSON.stringify(rules)}`,
);

const tableFile = join(root, 'large-table.md');
const astroFile = join(root, 'page.astro');
const textRouteFile = join(root, 'llms.txt.ts');
const emptyCodeFile = join(root, 'empty.ts');
await Promise.all([
  writeFile(tableFile, [
    '| Rule | Description | Example |',
    '| --- | --- | --- |',
    ...Array.from(
      { length: 45 },
      (_, index) => `| rule-${index} | This short cell explains local behavior number ${index} without becoming a prose sentence | This example remains deliberately brief and concrete |`,
    ),
  ].join('\n')),
  writeFile(astroFile, `---
const hidden = "frontmatter should not be linted";
---
<Layout title="A practical page title" description="A specific static page description.">
  <p>This visible Astro paragraph should be analyzed as page copy.</p>
</Layout>`),
  writeFile(textRouteFile, `export const GET = () => new Response(\`# Local reference

This multiline TypeScript template is returned as a plain text document for readers.
\`);`),
  writeFile(emptyCodeFile, 'export const answer = 42;\n'),
]);

const extraction = spawnSync(process.execPath, [
  cli,
  tableFile,
  astroFile,
  textRouteFile,
  '--ext', '.md,.astro,.ts',
  '--format', 'json',
  '--exit-zero',
  '--no-download',
], { cwd: root, encoding: 'utf8' });
assert.equal(extraction.status, 0, extraction.stderr);
const extractionReports = JSON.parse(extraction.stdout);
assert.equal(extractionReports.length, 3);
assert.ok(extractionReports.find((report) => report.filePath.endsWith('large-table.md'))?.wordCount > 300);
assert.ok(extractionReports.find((report) => report.filePath.endsWith('page.astro'))?.wordCount > 10);
assert.ok(extractionReports.find((report) => report.filePath.endsWith('llms.txt.ts'))?.wordCount > 10);

const empty = spawnSync(process.execPath, [
  cli,
  emptyCodeFile,
  '--ext', '.ts',
  '--format', 'json',
  '--exit-zero',
  '--no-download',
], { cwd: root, encoding: 'utf8' });
assert.equal(empty.status, 0, empty.stderr);
const [emptyReport] = JSON.parse(empty.stdout);
assert.equal(emptyReport.wordCount, 0);
assert.equal(emptyReport.messages[0]?.ruleId, 'slopsift/no-extractable-prose');

console.log(`Verified slopsift@${installed.version} as an isolated npm consumer (${reports[0].messages.length} findings).`);
