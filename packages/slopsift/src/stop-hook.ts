import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { Lint } from 'writinglint-core';
import { readCurrentTurnTranscript } from './agent-transcript.js';
import { listDirtyGitFiles } from './git-dirty.js';
import type {
  LintSourceOptions,
  MinimumLevel,
  RulepackName,
  SlopSiftResult,
} from './index.js';

export interface StopHookEvent {
  session_id: string;
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
  last_assistant_message: string | null;
  turn_id?: string;
  transcript_path?: string | null;
  cwd?: string;
}

export interface StopHookOutput {
  decision?: 'block';
  reason?: string;
  systemMessage?: string;
}

export interface StopHookOptions {
  level?: MinimumLevel;
  feedback?: 'compact' | 'detailed';
  rulepacks?: readonly RulepackName[];
  maxRetries?: number;
  maxFindings?: number;
  stateDirectory?: string;
  includeDirty?: boolean;
  includeTranscript?: boolean;
  transcriptPath?: string;
  cwd?: string;
  maxDirtyFiles?: number;
  maxTranscriptMessages?: number;
}

interface LintEngine {
  lintSource(filePath: string, source: string, options: LintSourceOptions): Promise<SlopSiftResult | undefined>;
}

interface RetryState {
  retries: number;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_FINDINGS = 100;
const DEFAULT_MAX_DIRTY_FILES = 50;
const DEFAULT_MAX_TRANSCRIPT_MESSAGES = 20;

interface EvidenceLint {
  label: string;
  source: string;
  lint: Lint;
  kind: 'response' | 'dirty-file' | 'transcript';
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('hook input must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/** Parse the shared Claude Code and Codex Stop-hook input contract. */
export function parseStopHookEvent(value: unknown): StopHookEvent {
  const input = objectRecord(value);
  if (input.hook_event_name !== 'Stop') throw new Error('hook_event_name must be "Stop"');
  if (typeof input.session_id !== 'string' || !input.session_id.trim()) {
    throw new Error('session_id must be a non-empty string');
  }
  if (typeof input.stop_hook_active !== 'boolean') {
    throw new Error('stop_hook_active must be a boolean');
  }
  if (input.last_assistant_message !== null && typeof input.last_assistant_message !== 'string') {
    throw new Error('last_assistant_message must be a string or null');
  }
  if (input.turn_id !== undefined && typeof input.turn_id !== 'string') {
    throw new Error('turn_id must be a string when present');
  }
  if (input.transcript_path !== undefined && input.transcript_path !== null && typeof input.transcript_path !== 'string') {
    throw new Error('transcript_path must be a string or null when present');
  }
  if (input.cwd !== undefined && typeof input.cwd !== 'string') {
    throw new Error('cwd must be a string when present');
  }
  return {
    session_id: input.session_id,
    hook_event_name: 'Stop',
    stop_hook_active: input.stop_hook_active,
    last_assistant_message: input.last_assistant_message,
    turn_id: input.turn_id,
    transcript_path: input.transcript_path,
    cwd: input.cwd,
  };
}

export function defaultStopHookStateDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const pluginData = env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA;
  return env.SLOPSIFT_HOOK_STATE_DIR || (pluginData
    ? join(pluginData, 'slopsift-stop-hook')
    : join(tmpdir(), 'slopsift-stop-hook'));
}

function statePath(directory: string, event: StopHookEvent): string {
  const key = createHash('sha256').update(event.session_id).digest('hex').slice(0, 32);
  return join(directory, `${key}.json`);
}

async function readRetries(path: string): Promise<number> {
  try {
    const state = JSON.parse(await readFile(path, 'utf8')) as RetryState;
    return Number.isInteger(state.retries) && state.retries >= 0 ? state.retries : 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    return 0;
  }
}

async function writeRetries(directory: string, path: string, retries: number): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify({ retries } satisfies RetryState)}\n`, 'utf8');
}

async function clearRetries(path: string): Promise<void> {
  await rm(path, { force: true });
}

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

function excerpt(lint: Lint, maxLength = 140): string {
  const text = lint.text.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function correctionInstruction(lints: readonly EvidenceLint[]): string {
  const kinds = new Set(lints.map(({ kind }) => kind));
  const actions = [kinds.has('response')
    ? 'Rewrite the response.'
    : 'Write a clear response without repeating these problems.'];
  if (kinds.has('dirty-file')) actions.push('Edit the listed files too.');
  actions.push('Preserve facts, commands, links, caveats, and file references.');
  actions.push('Fix each rule’s cause. Return only the revision; do not mention this review.');
  return actions.join(' ');
}

function detailedFindingsReason(lints: readonly EvidenceLint[], maxFindings: number, limits: string[]): string {
  const shown = lints.slice(0, maxFindings);
  const omitted = lints.length - shown.length;
  const findings = shown.map(({ label, source, lint }) => {
    const { line, column } = lineAndColumn(source, lint.start);
    const quoted = excerpt(lint);
    const level = lint.severity === 'warn' ? 'warning' : lint.severity;
    return `- ${level} at ${label}:${line}:${column} — ${lint.ruleId}: ${lint.message}${quoted ? `\n  Text: “${quoted}”` : ''}`;
  });
  if (omitted > 0) findings.push(`- ${omitted} additional finding${omitted === 1 ? '' : 's'} omitted.`);
  return [
    `The response needs another editing pass. SlopSift found ${lints.length} writing problem${lints.length === 1 ? '' : 's'} in this turn.`,
    correctionInstruction(lints),
    ...limits,
    '',
    'Problems to fix:',
    ...findings,
  ].join('\n');
}

interface FindingGroup {
  ruleId: string;
  severity: Lint['severity'];
  findings: EvidenceLint[];
}

function groupFindings(lints: readonly EvidenceLint[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of lints) {
    const key = `${finding.lint.severity}\0${finding.lint.ruleId}`;
    const group = groups.get(key);
    if (group) group.findings.push(finding);
    else groups.set(key, {
      ruleId: finding.lint.ruleId,
      severity: finding.lint.severity,
      findings: [finding],
    });
  }
  return [...groups.values()];
}

function compactGroup(group: FindingGroup, includeLabels: boolean, exampleLimit: number): string[] {
  const heading = `${group.ruleId} [${group.severity === 'warn' ? 'warning' : group.severity}] ×${group.findings.length}`;
  const message = group.findings[0]?.lint.message.replace(/\s+/g, ' ').trim() ?? '';
  const concise = message.length > 140 ? `${message.slice(0, 139)}…` : message;
  const anchors = [...new Set(group.findings.map(({ label, lint }) => {
    const text = excerpt(lint, 60);
    if (!text || text.length === 1) return '';
    return `${includeLabels ? `${label}: ` : ''}“${text}”`;
  }).filter(Boolean))].slice(0, exampleLimit);
  const remaining = group.findings.length - anchors.length;
  return [
    `${heading} — ${concise}`,
    ...(anchors.length ? [`  Examples: ${anchors.join('; ')}${remaining > 0 ? `; +${remaining} more` : ''}`] : []),
  ];
}

function compactFindingsReason(lints: readonly EvidenceLint[], maxFindings: number, limits: string[]): string {
  const grouped = groupFindings(lints);
  const includeLabels = lints.some(({ kind }) => kind !== 'response');
  const exampleLimit = Math.max(1, Math.min(3, Math.floor(maxFindings / Math.max(1, grouped.length))));
  const groups = grouped.flatMap((group) => compactGroup(group, includeLabels, exampleLimit));
  return [
    correctionInstruction(lints),
    `${lints.length} finding${lints.length === 1 ? '' : 's'} in ${grouped.length} rule group${grouped.length === 1 ? '' : 's'}.`,
    ...limits,
    ...groups,
  ].filter(Boolean).join('\n');
}

async function lintEvidence(
  engine: LintEngine,
  label: string,
  filePath: string,
  source: string,
  lintOptions: LintSourceOptions,
  kind: EvidenceLint['kind'],
): Promise<EvidenceLint[]> {
  const result = await engine.lintSource(filePath, source, lintOptions);
  return (result?.lints ?? []).map((lint) => ({ label, source, lint, kind }));
}

/**
 * Lint one completed agent response and return the shared Claude Code/Codex
 * Stop-hook decision. Retry state prevents an unbounded correction loop.
 */
export async function runStopHook(
  engine: LintEngine,
  event: StopHookEvent,
  options: StopHookOptions = {},
): Promise<StopHookOutput> {
  const level = options.level ?? 'warning';
  const feedback = options.feedback ?? 'compact';
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const maxDirtyFiles = options.maxDirtyFiles ?? DEFAULT_MAX_DIRTY_FILES;
  const maxTranscriptMessages = options.maxTranscriptMessages ?? DEFAULT_MAX_TRANSCRIPT_MESSAGES;
  const lintOptions: LintSourceOptions = {
    level,
    rulepacks: options.rulepacks,
  };
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be a non-negative integer');
  if (feedback !== 'compact' && feedback !== 'detailed') throw new Error('feedback must be compact or detailed');
  if (!Number.isInteger(maxFindings) || maxFindings < 1) throw new Error('maxFindings must be a positive integer');
  if (!Number.isInteger(maxDirtyFiles) || maxDirtyFiles < 1) throw new Error('maxDirtyFiles must be a positive integer');
  if (!Number.isInteger(maxTranscriptMessages) || maxTranscriptMessages < 1) throw new Error('maxTranscriptMessages must be a positive integer');

  const directory = options.stateDirectory ?? defaultStopHookStateDirectory();
  const path = statePath(directory, event);
  const evidence: EvidenceLint[] = [];
  const limits: string[] = [];
  const response = event.last_assistant_message?.trim() ?? '';
  if (response) {
    evidence.push(...await lintEvidence(engine, 'assistant response', 'assistant-response.md', response, lintOptions, 'response'));
  }

  if (options.includeTranscript) {
    const transcriptPath = options.transcriptPath ?? event.transcript_path;
    if (!transcriptPath) throw new Error('--include-transcript requires transcript_path in the hook input or --transcript-path');
    const messages = await readCurrentTurnTranscript(transcriptPath, {
      turnId: event.turn_id,
      maxMessages: maxTranscriptMessages,
    });
    for (const message of messages) {
      if (message.text.trim() === response) continue;
      evidence.push(...await lintEvidence(
        engine,
        `${transcriptPath}#record-${message.record}`,
        'assistant-transcript.md',
        message.text,
        lintOptions,
        'transcript',
      ));
    }
  }

  if (options.includeDirty) {
    const cwd = options.cwd ?? event.cwd ?? process.cwd();
    const dirty = await listDirtyGitFiles(cwd);
    const selected = dirty.files.slice(0, maxDirtyFiles);
    if (dirty.files.length > selected.length) {
      limits.push(`Only the first ${selected.length} of ${dirty.files.length} dirty files were checked; raise --max-dirty-files to inspect all of them.`);
    }
    for (const file of selected) {
      const source = await readFile(file, 'utf8');
      evidence.push(...await lintEvidence(engine, relative(dirty.root, file), file, source, lintOptions, 'dirty-file'));
    }
  }

  if (!evidence.length) {
    const retries = event.stop_hook_active ? await readRetries(path) : 0;
    await clearRetries(path);
    if (retries > 0) {
      return {
        systemMessage: [
          `SlopSift accepted the response after ${retries} automatic rewrite${retries === 1 ? '' : 's'}.`,
          ...limits,
        ].join(' '),
      };
    }
    return limits.length ? { systemMessage: limits.join(' ') } : {};
  }

  const storedRetries = event.stop_hook_active ? Math.max(1, await readRetries(path)) : 0;
  if (storedRetries >= maxRetries) {
    await clearRetries(path);
    return {
      systemMessage: `SlopSift still found ${evidence.length} writing problem${evidence.length === 1 ? '' : 's'} after ${maxRetries} automatic rewrite attempt${maxRetries === 1 ? '' : 's'}. The response was allowed through to avoid an infinite loop.`,
    };
  }

  await writeRetries(directory, path, storedRetries + 1);
  return {
    decision: 'block',
    reason: feedback === 'detailed'
      ? detailedFindingsReason(evidence, maxFindings, limits)
      : compactFindingsReason(evidence, maxFindings, limits),
  };
}

/** Convert hook runtime failures into a visible fail-open result. */
export function stopHookFailure(error: unknown): StopHookOutput {
  const message = error instanceof Error ? error.message : String(error);
  return {
    systemMessage: `SlopSift could not validate the final response and allowed it through: ${message}`,
  };
}
