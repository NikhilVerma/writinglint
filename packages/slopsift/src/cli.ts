#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AGENT_DEMO_DRAFT,
  AGENT_DEMO_REWRITE,
  inspectAgentHost,
  runAgentDemo,
  type AgentHost,
} from './agent-loop.js';
import {
  createSlopSift,
  type MinimumLevel,
  type RulepackName,
  type TechnicalEnglishMode,
} from './index.js';
import {
  parseAsdSte100Issue9StandardData,
  type AsdSte100Issue9StandardData,
} from 'writinglint-rulepack-technical-english';
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
  slopsift agent doctor               Check one agent installation and the validator
  slopsift agent demo                 Exercise the local correction decision
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
  --rulepack ai-style|asd-ste100      Select a rulepack (repeatable; default: ai-style)
  --technical-mode descriptive|procedural
                                      Text type for asd-ste100 (default: descriptive)
  --technical-standard-data <file>    Load local parsed Issue 9 data for dictionary checks
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

The command writes one JSON object to stdout. When SlopSift finds writing
problems, it requests a continuation. A runtime failure adds systemMessage and
lets the agent finish.`;

const AGENT_HELP = `slopsift agent — verify the automatic agent correction loop

Usage:
  slopsift agent doctor [options]     Check the host, plugin, model, and Stop-hook decision
  slopsift agent demo [options]       Reject a known-bad draft and accept a clean rewrite

Options:
  --host claude-code|codex            Host checked by doctor (default: claude-code)
  --json                              Write a machine-readable result
  --model <directory>                 Use an explicit ONNX model bundle
  --no-download                       Do not download a missing model
  --help, -h                          Show this help

Doctor is read-only. It can confirm that a plugin is installed and enabled, but
the host may still require hook trust or a restart before the first live turn.`;

interface Options {
  patterns: string[]; format: 'stylish' | 'json' | 'json-lines' | 'github'; extensions?: string[];
  ignores: string[]; noIgnore: boolean; quiet: boolean; maxWarnings: number;
  model?: string; download: boolean; level: 'info' | 'warning' | 'error';
  errorOnUnmatchedPattern: boolean;
  exitZero: boolean;
  rulepacks: RulepackName[];
  technicalMode: TechnicalEnglishMode;
  technicalStandardData?: string;
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

interface AgentOptions {
  action: 'doctor' | 'demo';
  host: AgentHost;
  json: boolean;
  model?: string;
  download: boolean;
}

function parse(argv: string[]): Options | 'help' | 'version' {
  const options: Options = { patterns: [], format: 'stylish', ignores: [], noIgnore: false, quiet: false, maxWarnings: -1, download: true, level: 'warning', errorOnUnmatchedPattern: true, exitZero: false, rulepacks: [], technicalMode: 'descriptive' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    const nextValue = (): string => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      return value;
    };
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
    else if (arg === '--rulepack') options.rulepacks.push(nextValue() as RulepackName);
    else if (arg === '--technical-mode') options.technicalMode = nextValue() as TechnicalEnglishMode;
    else if (arg === '--technical-standard-data') options.technicalStandardData = nextValue();
    else if (arg === '--model') options.model = argv[++index];
    else if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    else options.patterns.push(arg);
  }
  if (!['stylish', 'json', 'json-lines', 'github'].includes(options.format)) throw new Error(`unknown format: ${options.format}`);
  if (!['info', 'warning', 'error'].includes(options.level)) throw new Error(`unknown level: ${options.level}`);
  if (options.rulepacks.some((rulepack) => !['ai-style', 'asd-ste100'].includes(rulepack))) {
    throw new Error(`unknown rulepack: ${options.rulepacks.find((rulepack) => !['ai-style', 'asd-ste100'].includes(rulepack))}`);
  }
  if (!['descriptive', 'procedural'].includes(options.technicalMode)) throw new Error(`unknown technical mode: ${options.technicalMode}`);
  if (options.technicalStandardData && !options.rulepacks.includes('asd-ste100')) {
    throw new Error('--technical-standard-data requires --rulepack asd-ste100');
  }
  if (!Number.isInteger(options.maxWarnings) || options.maxWarnings < -1) throw new Error('--max-warnings must be a non-negative integer');
  if (!options.rulepacks.length) options.rulepacks.push('ai-style');
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

function parseAgent(argv: string[]): AgentOptions | 'help' {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help') return 'help';
  if (argv[0] !== 'doctor' && argv[0] !== 'demo') throw new Error('expected agent command "doctor" or "demo"');
  const options: AgentOptions = {
    action: argv[0],
    host: 'claude-code',
    json: false,
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
    if (arg === '--json') options.json = true;
    else if (arg === '--no-download') options.download = false;
    else if (arg === '--host') options.host = nextValue() as AgentHost;
    else if (arg === '--model') options.model = nextValue();
    else throw new Error(`unknown agent option: ${arg}`);
  }
  if (!['claude-code', 'codex'].includes(options.host)) throw new Error(`unknown agent host: ${options.host}`);
  if (options.action === 'demo' && options.host !== 'claude-code') throw new Error('--host only applies to agent doctor');
  return options;
}

async function exerciseAgentLoop(options: AgentOptions) {
  const directory = await mkdtemp(join(tmpdir(), 'slopsift-agent-demo-'));
  try {
    const slopsift = await createSlopSift({
      explicit: options.model,
      download: options.download,
      onProgress: (message) => console.error(message),
    });
    return await runAgentDemo(slopsift, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function hostLabel(host: AgentHost): string {
  return host === 'claude-code' ? 'Claude Code' : 'Codex';
}

function hostVersion(host: AgentHost, version?: string): string | undefined {
  if (!version) return undefined;
  return host === 'claude-code'
    ? version.replace(/\s*\(Claude Code\)\s*$/, '')
    : version.replace(/^codex-cli\s+/, '');
}

async function runAgent(argv: string[]): Promise<void> {
  let options: AgentOptions | 'help';
  try {
    options = parseAgent(argv);
  } catch (error) {
    console.error(`slopsift: ${(error as Error).message}\nRun slopsift agent --help for usage.`);
    process.exitCode = 2;
    return;
  }
  if (options === 'help') {
    console.log(AGENT_HELP);
    return;
  }

  if (options.action === 'demo') {
    try {
      const demo = await exerciseAgentLoop(options);
      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          draft: AGENT_DEMO_DRAFT,
          rewrite: AGENT_DEMO_REWRITE,
          rejectedDraft: demo.rejectedDraft,
          acceptedRewrite: demo.acceptedRewrite,
        }, null, 2));
      } else {
        console.log([
          'SlopSift agent demo',
          '',
          `Draft: ${AGENT_DEMO_DRAFT}`,
          'Result: rewrite requested',
          '',
          demo.rejectedDraft.reason ?? '',
          '',
          `Rewrite: ${AGENT_DEMO_REWRITE}`,
          `Result: ${demo.acceptedRewrite.systemMessage ?? 'accepted'}`,
        ].join('\n'));
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error(`SlopSift agent demo failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exitCode = 1;
    }
    return;
  }

  const host = inspectAgentHost(options.host);
  let demo;
  let validatorError: string | undefined;
  try {
    demo = await exerciseAgentLoop(options);
  } catch (error) {
    validatorError = error instanceof Error ? error.message : String(error);
  }
  const ok = host.pluginState === 'ready' && demo !== undefined;
  if (options.json) {
    console.log(JSON.stringify({
      ok,
      host,
      validator: demo ? {
        ready: true,
        rejectedKnownBadDraft: demo.rejectedDraft.decision === 'block',
        acceptedCleanRewrite: demo.acceptedRewrite.decision !== 'block',
      } : { ready: false, error: validatorError },
      limitation: 'Hook execution and trust can only be confirmed by completing a live agent turn.',
    }, null, 2));
  } else {
    const version = hostVersion(host.host, host.version);
    const lines = [
      'SlopSift agent doctor',
      '',
      demo
        ? '✓ Validator rejected the known-bad draft and accepted the clean rewrite.'
        : `✗ Validator failed: ${validatorError}`,
      host.installed
        ? `✓ ${hostLabel(host.host)} is installed${version ? ` (${version})` : ''}.`
        : `✗ ${hostLabel(host.host)} is not installed.`,
    ];
    if (host.pluginState === 'ready') {
      lines.push(`✓ SlopSift${host.pluginVersion ? ` ${host.pluginVersion}` : ''} is installed and enabled.`);
      lines.push('  Start a new agent session before the live test if you installed or updated the plugin just now.');
    } else if (host.pluginState === 'disabled') {
      lines.push('✗ SlopSift is installed but disabled. Enable it, then restart the agent.');
    } else if (host.pluginState === 'unknown') {
      lines.push(`✗ SlopSift plugin state could not be read${host.detail ? `: ${host.detail}` : '.'}`);
    } else {
      lines.push('✗ SlopSift is not installed in this agent.');
      lines.push('', 'Install it with:');
      for (const command of host.installCommands) lines.push(`  ${command}`);
    }
    lines.push('', 'A doctor run cannot prove hook trust. Complete the live test in AGENT-HOOKS.md after installation.');
    console.log(lines.join('\n'));
  }
  if (!ok) process.exitCode = 1;
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
  if (argv[0] === 'agent') {
    await runAgent(argv.slice(1));
    return;
  }
  let options: Options | 'help' | 'version';
  try { options = parse(argv); }
  catch (error) { console.error(`slopsift: ${(error as Error).message}\nRun slopsift --help for usage.`); process.exitCode = 2; return; }
  if (options === 'help') { console.log(HELP); return; }
  if (options === 'version') { console.log(VERSION); return; }

  try {
    let technicalStandardData: AsdSte100Issue9StandardData | undefined;
    if (options.technicalStandardData) {
      const path = resolve(options.technicalStandardData);
      technicalStandardData = parseAsdSte100Issue9StandardData(JSON.parse(readFileSync(path, 'utf8')));
    }
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
    const { results, runtimeFailures } = await lintFiles(slopsift, files, {
      level,
      rulepacks: options.rulepacks,
      technicalMode: options.technicalMode,
      technicalStandardData,
      explicitlySelectedFiles,
    });
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
