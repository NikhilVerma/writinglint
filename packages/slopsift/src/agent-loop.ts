import { spawnSync } from 'node:child_process';
import type { LintSourceOptions, SlopSiftResult } from './index.js';
import { runStopHook, type StopHookOutput } from './stop-hook.js';

export type AgentHost = 'claude-code' | 'codex';
export type AgentPluginState = 'ready' | 'missing' | 'disabled' | 'unknown';

export interface AgentHostInspection {
  host: AgentHost;
  binary: string;
  installed: boolean;
  version?: string;
  pluginState: AgentPluginState;
  pluginVersion?: string;
  detail?: string;
  installCommands: string[];
}

export interface AgentDemoResult {
  rejectedDraft: StopHookOutput;
  acceptedRewrite: StopHookOutput;
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type AgentCommandRunner = (command: string, args: string[]) => CommandResult;

interface DemoLintEngine {
  lintSource(filePath: string, source: string, options: LintSourceOptions): Promise<SlopSiftResult | undefined>;
}

interface PluginRecord {
  id?: unknown;
  installed?: unknown;
  name?: unknown;
  pluginId?: unknown;
  version?: unknown;
  enabled?: unknown;
}

export const AGENT_DEMO_DRAFT = 'Kept modest deliberately: the win comes from narrower prompts, not from saturating the model gate.';
export const AGENT_DEMO_REWRITE = 'The workflow limits concurrency because focused prompts improve its evidence search more than additional parallel model calls would.';

const INSTALL_COMMANDS: Record<AgentHost, string[]> = {
  'claude-code': [
    '/plugin marketplace add NikhilVerma/writinglint',
    '/plugin install slopsift@slopsift',
  ],
  codex: [
    'codex plugin marketplace add NikhilVerma/writinglint',
    'codex plugin add slopsift@slopsift',
  ],
};

const defaultCommandRunner: AgentCommandRunner = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
};

function record(value: unknown): PluginRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as PluginRecord : undefined;
}

function pluginName(value: PluginRecord): string | undefined {
  for (const candidate of [value.name, value.pluginId, value.id]) {
    if (typeof candidate === 'string') return candidate.split('@')[0];
  }
  return undefined;
}

function installedPlugins(host: AgentHost, source: string): PluginRecord[] {
  const parsed = JSON.parse(source) as unknown;
  const entries = host === 'claude-code'
    ? parsed
    : record(parsed)?.installed;
  if (!Array.isArray(entries)) throw new Error('plugin list JSON did not contain an installed plugin array');
  return entries.flatMap((value) => {
    const item = record(value);
    return item ? [item] : [];
  });
}

/** Inspect one installed coding-agent CLI without changing its configuration. */
export function inspectAgentHost(
  host: AgentHost,
  runCommand: AgentCommandRunner = defaultCommandRunner,
): AgentHostInspection {
  const binary = host === 'claude-code' ? 'claude' : 'codex';
  const installCommands = INSTALL_COMMANDS[host];
  const versionResult = runCommand(binary, ['--version']);
  if (versionResult.error || versionResult.status !== 0) {
    return {
      host,
      binary,
      installed: false,
      pluginState: 'missing',
      detail: versionResult.error?.message || versionResult.stderr.trim() || `${binary} is not installed`,
      installCommands,
    };
  }

  const version = versionResult.stdout.trim() || versionResult.stderr.trim();
  const listResult = runCommand(binary, ['plugin', 'list', '--json']);
  if (listResult.error || listResult.status !== 0) {
    return {
      host,
      binary,
      installed: true,
      version,
      pluginState: 'unknown',
      detail: listResult.error?.message || listResult.stderr.trim() || 'the plugin list command failed',
      installCommands,
    };
  }

  try {
    const plugin = installedPlugins(host, listResult.stdout).find((entry) => pluginName(entry) === 'slopsift');
    if (!plugin) {
      return { host, binary, installed: true, version, pluginState: 'missing', installCommands };
    }
    return {
      host,
      binary,
      installed: true,
      version,
      pluginState: plugin.enabled === false ? 'disabled' : 'ready',
      pluginVersion: typeof plugin.version === 'string' ? plugin.version : undefined,
      installCommands,
    };
  } catch (error) {
    return {
      host,
      binary,
      installed: true,
      version,
      pluginState: 'unknown',
      detail: error instanceof Error ? error.message : String(error),
      installCommands,
    };
  }
}

/** Exercise the real Stop-hook decision with one known-bad draft and one clean rewrite. */
export async function runAgentDemo(
  engine: DemoLintEngine,
  stateDirectory: string,
): Promise<AgentDemoResult> {
  const shared = {
    session_id: 'slopsift-agent-demo',
    hook_event_name: 'Stop' as const,
  };
  const rejectedDraft = await runStopHook(engine, {
    ...shared,
    stop_hook_active: false,
    last_assistant_message: AGENT_DEMO_DRAFT,
  }, { stateDirectory });
  if (rejectedDraft.decision !== 'block') {
    throw new Error('the known-bad demo response was not rejected');
  }

  const acceptedRewrite = await runStopHook(engine, {
    ...shared,
    stop_hook_active: true,
    last_assistant_message: AGENT_DEMO_REWRITE,
  }, { stateDirectory });
  if (acceptedRewrite.decision === 'block') {
    throw new Error('the clean demo rewrite was rejected');
  }
  return { rejectedDraft, acceptedRewrite };
}
