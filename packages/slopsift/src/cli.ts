#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSlopSift, type MinimumLevel } from './index.js';
import { findFiles } from './files.js';
import { github, jsonResult, stylish } from './format.js';
import { lintFiles } from './run-files.js';
import {
  defaultStopHookStateDirectory,
  parseStopHookEvent,
  runStopHook,
  stopHookFailure,
} from './stop-hook.js';

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
const HELP = `slopsift — lint prose and code comments for AI slop

Usage:
  slopsift [patterns...]              Lint files, directories, or globs
  slopsift hook stop                  Validate an agent's final response from stdin
  bunx slopsift .                    Lint the current project

Options:
  --format, -f stylish|json|json-lines|github
  --json                              Alias for --format json
  --ext .md,.txt,.ts                  Extensions to include
  --ignore-pattern <glob>             Additional ignore pattern (repeatable)
  --no-ignore                         Do not read .gitignore
  --no-error-on-unmatched-pattern     Exit 0 when no supported files match
  --quiet                             Report errors only
  --exit-zero                         Report findings without failing the run
  --level info|warning|error          Minimum level to report (default: warning)
  --max-warnings <n>                  Exit 1 above this warning count
  --model <directory>                 Use an explicit ONNX model bundle
  --no-download                       Fail instead of downloading a missing model
  --version, -v                       Print the version
  --help, -h                          Show this help

Exit codes: 0 clean, 1 lint problems, 2 configuration/runtime failure.`;

const HOOK_HELP = `slopsift hook stop — validate a Claude Code, Codex, or Pi final response

Usage:
  slopsift hook stop [options] < hook-event.json

Options:
  --level info|warning|error          Minimum level that requests a rewrite (default: warning)
  --max-retries <n>                   Automatic rewrite requests before fail-open (default: 2)
  --max-findings <n>                  Findings included in revision feedback (default: 5)
  --include-dirty                     Also lint prose in modified and untracked Git files
  --include-transcript                Also lint assistant prose stored for the active turn
  --transcript-path <file>            Override the transcript path supplied by the agent
  --cwd <directory>                   Git working directory (default: hook cwd or process cwd)
  --max-dirty-files <n>               Maximum dirty files to inspect (default: 50)
  --max-transcript-messages <n>       Maximum active-turn messages to inspect (default: 20)
  --state-dir <directory>             Retry-state directory (normally set by the plugin)
  --model <directory>                 Use an explicit ONNX model bundle
  --no-download                       Fail open instead of downloading a missing model
  --help, -h                          Show this help

The command always writes one JSON object to stdout. Writing findings requests a
continuation; runtime failures are reported through systemMessage and fail open.`;

interface Options {
  patterns: string[]; format: 'stylish' | 'json' | 'json-lines' | 'github'; extensions?: string[];
  ignores: string[]; noIgnore: boolean; quiet: boolean; maxWarnings: number;
  model?: string; download: boolean; level: 'info' | 'warning' | 'error';
  errorOnUnmatchedPattern: boolean;
  exitZero: boolean;
}

interface HookOptions {
  level: MinimumLevel;
  maxRetries: number;
  maxFindings: number;
  includeDirty: boolean;
  includeTranscript: boolean;
  transcriptPath?: string;
  cwd?: string;
  maxDirtyFiles: number;
  maxTranscriptMessages: number;
  stateDirectory: string;
  model?: string;
  download: boolean;
}

function parse(argv: string[]): Options | 'help' | 'version' {
  const options: Options = { patterns: [], format: 'stylish', ignores: [], noIgnore: false, quiet: false, maxWarnings: -1, download: true, level: 'warning', errorOnUnmatchedPattern: true, exitZero: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '-v' || arg === '--version') return 'version';
    if (arg === '--json') options.format = 'json';
    else if (arg === '--no-ignore') options.noIgnore = true;
    else if (arg === '--no-error-on-unmatched-pattern') options.errorOnUnmatchedPattern = false;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--exit-zero') options.exitZero = true;
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
  if (!['stylish', 'json', 'json-lines', 'github'].includes(options.format)) throw new Error(`unknown format: ${options.format}`);
  if (!['info', 'warning', 'error'].includes(options.level)) throw new Error(`unknown level: ${options.level}`);
  if (!Number.isInteger(options.maxWarnings) || options.maxWarnings < -1) throw new Error('--max-warnings must be a non-negative integer');
  if (!options.patterns.length) options.patterns.push('.');
  return options;
}

function parseHook(argv: string[]): HookOptions | 'help' {
  if (argv[0] === '-h' || argv[0] === '--help') return 'help';
  if (argv[0] !== 'stop') throw new Error('expected hook type "stop"');
  const options: HookOptions = {
    level: 'warning',
    maxRetries: 2,
    maxFindings: 5,
    includeDirty: false,
    includeTranscript: false,
    maxDirtyFiles: 50,
    maxTranscriptMessages: 20,
    stateDirectory: defaultStopHookStateDirectory(),
    download: true,
  };
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    const nextValue = (): string => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '--no-download') options.download = false;
    else if (arg === '--include-dirty') options.includeDirty = true;
    else if (arg === '--include-transcript') options.includeTranscript = true;
    else if (arg === '--level') options.level = nextValue() as MinimumLevel;
    else if (arg === '--max-retries') options.maxRetries = Number(nextValue());
    else if (arg === '--max-findings') options.maxFindings = Number(nextValue());
    else if (arg === '--max-dirty-files') options.maxDirtyFiles = Number(nextValue());
    else if (arg === '--max-transcript-messages') options.maxTranscriptMessages = Number(nextValue());
    else if (arg === '--transcript-path') options.transcriptPath = nextValue();
    else if (arg === '--cwd') options.cwd = nextValue();
    else if (arg === '--state-dir') options.stateDirectory = nextValue();
    else if (arg === '--model') options.model = nextValue();
    else throw new Error(`unknown hook option: ${arg}`);
  }
  if (!['info', 'warning', 'error'].includes(options.level)) throw new Error(`unknown level: ${options.level}`);
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) throw new Error('--max-retries must be a non-negative integer');
  if (!Number.isInteger(options.maxFindings) || options.maxFindings < 1) throw new Error('--max-findings must be a positive integer');
  if (!Number.isInteger(options.maxDirtyFiles) || options.maxDirtyFiles < 1) throw new Error('--max-dirty-files must be a positive integer');
  if (!Number.isInteger(options.maxTranscriptMessages) || options.maxTranscriptMessages < 1) throw new Error('--max-transcript-messages must be a positive integer');
  if (options.transcriptPath === '') throw new Error('--transcript-path must not be empty');
  if (options.cwd === '') throw new Error('--cwd must not be empty');
  if (!options.stateDirectory) throw new Error('--state-dir must not be empty');
  return options;
}

async function runHook(argv: string[]): Promise<void> {
  let options: HookOptions | 'help';
  try {
    options = parseHook(argv);
  } catch (error) {
    console.error(`slopsift: ${(error as Error).message}\nRun slopsift hook --help for usage.`);
    process.exitCode = 2;
    return;
  }
  if (options === 'help') {
    console.log(HOOK_HELP);
    return;
  }

  try {
    const event = parseStopHookEvent(JSON.parse(readFileSync(0, 'utf8')) as unknown);
    const slopsift = await createSlopSift({
      explicit: options.model,
      download: options.download,
      onProgress: (message) => console.error(message),
    });
    const output = await runStopHook(slopsift, event, {
      level: options.level,
      maxRetries: options.maxRetries,
      maxFindings: options.maxFindings,
      stateDirectory: options.stateDirectory,
      includeDirty: options.includeDirty,
      includeTranscript: options.includeTranscript,
      transcriptPath: options.transcriptPath,
      cwd: options.cwd,
      maxDirtyFiles: options.maxDirtyFiles,
      maxTranscriptMessages: options.maxTranscriptMessages,
    });
    console.log(JSON.stringify(output));
  } catch (error) {
    console.log(JSON.stringify(stopHookFailure(error)));
  }
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'hook') {
    await runHook(argv.slice(1));
    return;
  }
  let options: Options | 'help' | 'version';
  try { options = parse(argv); }
  catch (error) { console.error(`slopsift: ${(error as Error).message}\nRun slopsift --help for usage.`); process.exitCode = 2; return; }
  if (options === 'help') { console.log(HELP); return; }
  if (options === 'version') { console.log(VERSION); return; }

  try {
    const files = await findFiles(options.patterns, { noIgnore: options.noIgnore, ignorePatterns: options.ignores, extensions: options.extensions });
    if (!files.length) {
      if (options.errorOnUnmatchedPattern) {
        throw new Error(`no supported files matched: ${options.patterns.join(', ')} (use --no-error-on-unmatched-pattern to allow an empty match)`);
      }
      if (options.format === 'json') console.log('[]');
      return;
    }
    const slopsift = await createSlopSift({
      explicit: options.model,
      download: options.download,
      onProgress: (message) => { if (options.format === 'stylish') console.error(message); },
    });
    const level: MinimumLevel = options.quiet ? 'error' : options.level;
    const explicitlySelectedFiles = new Set(options.patterns.map((pattern) => resolve(pattern)));
    const { results, runtimeFailures } = await lintFiles(slopsift, files, { level, explicitlySelectedFiles });
    if (options.format === 'json') console.log(JSON.stringify(results.map(jsonResult), null, 2));
    else if (options.format === 'json-lines') for (const result of results) console.log(JSON.stringify(jsonResult(result)));
    else if (options.format === 'github') { const output = github(results); if (output) console.log(output); }
    else { const output = stylish(results); if (output) console.log(output); }
    const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
    const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
    if (runtimeFailures) process.exitCode = 2;
    else if (!options.exitZero && (errors || (options.maxWarnings >= 0 && warnings > options.maxWarnings))) process.exitCode = 1;
  } catch (error) {
    console.error(`slopsift: ${(error as Error).message}`);
    process.exitCode = 2;
  }
}

await run();
