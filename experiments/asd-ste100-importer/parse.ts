import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { loadDoclingDocument } from './src/docling.js';
import { parseSteDocument } from './src/parser.js';

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function integerOption(args: readonly string[], name: string, fallback: number): number {
  const value = option(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function insideDirectory(path: string, directory: string): boolean {
  const pathFromDirectory = relative(directory, path);
  return pathFromDirectory === ''
    || (!pathFromDirectory.startsWith('..') && !isAbsolute(pathFromDirectory));
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

const args = process.argv.slice(2);
const inputOption = option(args, '--input');
if (!inputOption) throw new Error('--input <docling-json> is required.');
const input = resolve(inputOption);
const outputOption = option(args, '--output');
const output = outputOption ? resolve(outputOption) : undefined;
const maxIssues = args.includes('--all-issues')
  ? Number.POSITIVE_INFINITY
  : integerOption(args, '--max-issues', 20);
if (output && insideDirectory(output, process.cwd()) && !args.includes('--allow-repo-output')) {
  throw new Error('Refusing to write extracted standard content inside the repository. Choose an external path or pass --allow-repo-output.');
}

const result = parseSteDocument(loadDoclingDocument(input), {
  validateIssue9: !args.includes('--no-validate-issue9'),
});
result.source.doclingJsonSha256 = await sha256(input);

if (output) {
  await writeAtomically(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

const errors = result.issues.filter(({ severity }) => severity === 'error');
const warnings = result.issues.filter(({ severity }) => severity === 'warning');
console.log(`Rules: ${result.writingRules.rules.length} in ${result.writingRules.sections.length} sections`);
console.log(`Subject index: ${result.frontMatter.subjectIndex.length} entries`);
console.log(`Dictionary: ${result.dictionary.stats.entries} entries (${result.dictionary.stats.approvedEntries} approved, ${result.dictionary.stats.nonApprovedEntries} non-approved)`);
console.log(`Dictionary tables: ${result.dictionary.stats.tables}; physical-column exceptions: ${result.dictionary.stats.physicalColumnExceptions}`);
console.log(`Issues: ${errors.length} errors, ${warnings.length} warnings`);
for (const issue of result.issues.slice(0, maxIssues)) {
  const location = issue.source?.page ? ` page ${issue.source.page}` : '';
  console.log(`  ${issue.severity} ${issue.code}${location}: ${issue.message}`);
}
if (result.issues.length > maxIssues) {
  console.log(`  ${result.issues.length - maxIssues} more issues omitted; use --all-issues to show them.`);
}
if (errors.length) process.exitCode = 1;
