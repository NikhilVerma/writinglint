#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';
import { createSlopSift, type MinimumLevel } from './index.js';
import { findFiles } from './files.js';
import { jsonResult, makeResult, stylish, type Result } from './format.js';

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
const HELP = `slopsift — lint prose and code comments for AI slop

Usage:
  slopsift [patterns...]              Lint files, directories, or globs
  bunx slopsift .                    Lint the current project

Options:
  --format, -f stylish|json|json-lines
  --json                              Alias for --format json
  --ext .md,.txt,.ts                  Extensions to include
  --ignore-pattern <glob>             Additional ignore pattern (repeatable)
  --no-ignore                         Do not read .gitignore
  --quiet                             Report errors only
  --level info|warning|error          Minimum level to report (default: warning)
  --max-warnings <n>                  Exit 1 above this warning count
  --model <directory>                 Use an explicit ONNX model bundle
  --no-download                       Fail instead of downloading a missing model
  --version, -v                       Print the version
  --help, -h                          Show this help

Exit codes: 0 clean, 1 lint problems, 2 configuration/runtime failure.`;

interface Options {
  patterns: string[]; format: 'stylish' | 'json' | 'json-lines'; extensions?: string[];
  ignores: string[]; noIgnore: boolean; quiet: boolean; maxWarnings: number;
  model?: string; download: boolean; level: 'info' | 'warning' | 'error';
}

function parse(argv: string[]): Options | 'help' | 'version' {
  const options: Options = { patterns: [], format: 'stylish', ignores: [], noIgnore: false, quiet: false, maxWarnings: -1, download: true, level: 'warning' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '-v' || arg === '--version') return 'version';
    if (arg === '--json') options.format = 'json';
    else if (arg === '--no-ignore') options.noIgnore = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--no-download') options.download = false;
    else if (arg === '-f' || arg === '--format') options.format = argv[++index] as Options['format'];
    else if (arg === '--ext') options.extensions = (argv[++index] ?? '').split(',').filter(Boolean);
    else if (arg === '--ignore-pattern') options.ignores.push(argv[++index] ?? '');
    else if (arg === '--max-warnings') options.maxWarnings = Number(argv[++index]);
    else if (arg === '--level') options.level = argv[++index] as Options['level'];
    else if (arg === '--model') options.model = argv[++index];
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else options.patterns.push(arg);
  }
  if (!['stylish', 'json', 'json-lines'].includes(options.format)) throw new Error(`unknown format: ${options.format}`);
  if (!['info', 'warning', 'error'].includes(options.level)) throw new Error(`unknown level: ${options.level}`);
  if (!Number.isInteger(options.maxWarnings) || options.maxWarnings < -1) throw new Error('--max-warnings must be a non-negative integer');
  if (!options.patterns.length) options.patterns.push('.');
  return options;
}

async function run(): Promise<void> {
  let options: Options | 'help' | 'version';
  try { options = parse(process.argv.slice(2)); }
  catch (error) { console.error(`slopsift: ${(error as Error).message}\nRun slopsift --help for usage.`); process.exitCode = 2; return; }
  if (options === 'help') { console.log(HELP); return; }
  if (options === 'version') { console.log(VERSION); return; }

  try {
    const files = await findFiles(options.patterns, { noIgnore: options.noIgnore, ignorePatterns: options.ignores, extensions: options.extensions });
    if (!files.length) throw new Error(`no supported files matched: ${options.patterns.join(', ')}`);
    const slopsift = await createSlopSift({
      explicit: options.model,
      download: options.download,
      onProgress: (message) => { if (options.format === 'stylish') console.error(message); },
    });
    const level: MinimumLevel = options.quiet ? 'error' : options.level;
    const results: Result[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const report = await slopsift.lintSource(file, source, { level });
      if (!report) continue;
      const local = relative(process.cwd(), file);
      const label = local === '..' || local.startsWith(`..${sep}`)
        ? file
        : (local || file);
      const result = makeResult(label, source, report.lints);
      results.push(result);
    }
    if (options.format === 'json') console.log(JSON.stringify(results.map(jsonResult), null, 2));
    else if (options.format === 'json-lines') for (const result of results) console.log(JSON.stringify(jsonResult(result)));
    else { const output = stylish(results); if (output) console.log(output); }
    const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
    const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
    if (errors || (options.maxWarnings >= 0 && warnings > options.maxWarnings)) process.exitCode = 1;
  } catch (error) {
    console.error(`slopsift: ${(error as Error).message}`);
    process.exitCode = 2;
  }
}

await run();
