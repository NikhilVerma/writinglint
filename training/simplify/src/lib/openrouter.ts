import path from 'node:path';

import { fakeLlm, loadApiKey, runsDir } from './env.ts';
import { appendJsonl, readJsonl } from './store.ts';

const LEDGER = path.join(runsDir, 'cost-ledger.jsonl');
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

interface LedgerLine {
  ts: string;
  purpose: string;
  label: string;
  model: string;
  requestId: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

/** Total spend across every run, deduplicated by provider request id. */
export function totalSpentUsd(): number {
  const seen = new Set<string>();
  let total = 0;
  for (const line of readJsonl<LedgerLine>(LEDGER)) {
    if (line.requestId && seen.has(line.requestId)) continue;
    if (line.requestId) seen.add(line.requestId);
    total += line.costUsd;
  }
  return total;
}

export class SpendCapError extends Error {
  constructor(spent: number, cap: number) {
    super(`OpenRouter spend cap reached: $${spent.toFixed(2)} of $${cap.toFixed(2)}. Raise capUsd in config.json to continue.`);
    this.name = 'SpendCapError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  purpose: 'generate' | 'judge' | 'fix' | 'human-rewrite';
  label: string;
  capUsd: number;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  responseFormat?: unknown;
  /** OpenRouter reasoning control, e.g. { effort: 'low' } for reasoning models. */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; enabled?: boolean };
}

export interface ChatResult {
  text: string;
  costUsd: number;
  requestId: string;
  finishReason: string | null;
  promptTokens: number;
  completionTokens: number;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  if (fakeLlm) return fakeChat(opts);
  const spent = totalSpentUsd();
  if (spent >= opts.capUsd) throw new SpendCapError(spent, opts.capUsd);

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    usage: { include: true },
  };
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.seed !== undefined) body.seed = opts.seed;
  if (opts.responseFormat !== undefined) body.response_format = opts.responseFormat;
  if (opts.reasoning !== undefined) body.reasoning = opts.reasoning;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loadApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const error = new Error(`OpenRouter ${response.status} for ${opts.model}: ${raw.slice(0, 400)}`);
    (error as Error & { retryable: boolean }).retryable = retryable;
    throw error;
  }
  const data = JSON.parse(raw) as {
    id: string;
    choices: { message: { content: string }; finish_reason: string | null }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (data.error) throw new Error(`OpenRouter error for ${opts.model}: ${data.error.message ?? JSON.stringify(data.error)}`);
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error(`OpenRouter returned no choices for ${opts.model}: ${raw.slice(0, 400)}`);

  const result: ChatResult = {
    text: choice.message.content ?? '',
    costUsd: data.usage?.cost ?? 0,
    requestId: data.id,
    finishReason: choice.finish_reason ?? null,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
  const line: LedgerLine = {
    ts: new Date().toISOString(),
    purpose: opts.purpose,
    label: opts.label,
    model: opts.model,
    requestId: result.requestId,
    costUsd: result.costUsd,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
  appendJsonl(LEDGER, line);
  return result;
}

function fakeChat(opts: ChatOptions): ChatResult {
  const text =
    opts.purpose === 'judge'
      ? JSON.stringify({
          missing_facts: [],
          changed_claims: [],
          added_claims: [],
          lost_links_or_references: [],
          modality_changes: [],
          verdict: 'pass',
          reasoning: 'fake judge',
        })
      : "In today's fast-paced world, standing desks are a game-changer. They seamlessly unlock a plethora of benefits.";
  return {
    text,
    costUsd: 0,
    requestId: `fake-${opts.purpose}-${opts.model}`,
    finishReason: 'stop',
    promptTokens: 0,
    completionTokens: 0,
  };
}
