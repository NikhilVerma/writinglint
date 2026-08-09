import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

interface PiContext {
  cwd: string;
  sessionManager: {
    getSessionFile(): string | undefined;
    getSessionId(): string;
  };
  ui: {
    notify(message: string, type?: 'info' | 'warning' | 'error'): void;
  };
}

interface PiApi {
  registerFlag(name: string, options: { description: string; type: 'boolean'; default: boolean }): void;
  getFlag(name: string): boolean | string | undefined;
  on(event: 'agent_end', handler: (event: { messages: readonly unknown[] }, ctx: PiContext) => Promise<void>): void;
  sendMessage(
    message: { customType: string; content: string; display: boolean },
    options: { deliverAs: 'followUp'; triggerTurn: true },
  ): void;
}

interface HookOutput {
  decision?: 'block';
  reason?: string;
  systemMessage?: string;
}

function assistantText(messages: readonly unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index] as { role?: string; content?: unknown } | undefined;
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
    const text = message.content.flatMap((block) => {
      const item = block as { type?: string; text?: unknown };
      return item.type === 'text' && typeof item.text === 'string' ? [item.text] : [];
    }).join('\n').trim();
    if (text) return text;
  }
  return '';
}

async function runHook(input: unknown, options: { dirty: boolean; transcript: boolean }): Promise<HookOutput> {
  const script = fileURLToPath(new URL('../scripts/stop-hook.mjs', import.meta.url));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SLOPSIFT_HOOK_INCLUDE_DIRTY: options.dirty ? '1' : '0',
        SLOPSIFT_HOOK_INCLUDE_TRANSCRIPT: options.transcript ? '1' : '0',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ systemMessage: error.message }));
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout) as HookOutput);
      } catch {
        resolve({ systemMessage: stderr.trim() || 'SlopSift returned invalid hook output.' });
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export default function slopSiftExtension(pi: PiApi): void {
  let correcting = false;

  pi.registerFlag('slopsift-dirty', {
    description: 'Also lint prose and comments in dirty Git files',
    type: 'boolean',
    default: false,
  });
  pi.registerFlag('slopsift-transcript', {
    description: 'Also lint assistant prose stored during the active Pi turn',
    type: 'boolean',
    default: false,
  });

  pi.on('agent_end', async (event, ctx) => {
    const response = assistantText(event.messages);
    if (!response) return;
    const transcriptPath = ctx.sessionManager.getSessionFile();
    const output = await runHook({
      session_id: ctx.sessionManager.getSessionId(),
      hook_event_name: 'Stop',
      stop_hook_active: correcting,
      last_assistant_message: response,
      transcript_path: transcriptPath,
      cwd: ctx.cwd,
    }, {
      dirty: pi.getFlag('slopsift-dirty') === true,
      transcript: pi.getFlag('slopsift-transcript') === true,
    });

    if (output.systemMessage) ctx.ui.notify(output.systemMessage, 'warning');
    if (output.decision !== 'block' || !output.reason) {
      correcting = false;
      return;
    }
    correcting = true;
    pi.sendMessage({
      customType: 'slopsift-correction',
      content: output.reason,
      display: true,
    }, {
      deliverAs: 'followUp',
      triggerTurn: true,
    });
  });
}
