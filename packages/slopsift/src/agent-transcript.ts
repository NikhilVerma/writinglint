import { readFile } from 'node:fs/promises';

export interface TranscriptMessage {
  /** One-based JSONL record containing this message. */
  record: number;
  text: string;
}

export interface TranscriptReadOptions {
  turnId?: string;
  maxMessages?: number;
}

interface ParsedRecord {
  record: number;
  value: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textBlocks(content: unknown, textType: 'text' | 'output_text' = 'text'): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.flatMap((item) => {
    const block = object(item);
    return block?.type === textType && typeof block.text === 'string' ? [block.text] : [];
  }).join('\n');
}

function parseJsonLines(source: string): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const value = object(JSON.parse(line));
      if (value) records.push({ record: index + 1, value });
    } catch {
      // Session files can be read while an agent is appending the next record.
    }
  }
  return records;
}

function isHumanClaudeMessage(value: Record<string, unknown>): boolean {
  if (value.type !== 'user') return false;
  const message = object(value.message);
  if (message?.role !== 'user') return false;
  if (typeof message.content === 'string') return true;
  return Array.isArray(message.content) && message.content.some((item) => object(item)?.type === 'text');
}

function claudeMessage(value: Record<string, unknown>): string {
  if (value.type !== 'assistant') return '';
  const message = object(value.message);
  return message?.role === 'assistant' ? textBlocks(message.content) : '';
}

function codexBoundary(value: Record<string, unknown>, turnId?: string): boolean {
  const payload = object(value.payload);
  if (turnId && value.type === 'turn_context' && payload?.turn_id === turnId) return true;
  return !turnId && value.type === 'response_item' && payload?.type === 'message' && payload.role === 'user';
}

function codexMessage(value: Record<string, unknown>): string {
  const payload = object(value.payload);
  if (value.type !== 'response_item' || payload?.type !== 'message' || payload.role !== 'assistant') return '';
  return textBlocks(payload.content, 'output_text');
}

function piBoundary(value: Record<string, unknown>): boolean {
  const message = object(value.message);
  return value.type === 'message' && message?.role === 'user';
}

function piMessage(value: Record<string, unknown>): string {
  const message = object(value.message);
  return value.type === 'message' && message?.role === 'assistant' ? textBlocks(message.content) : '';
}

function lastBoundary(records: readonly ParsedRecord[], predicate: (value: Record<string, unknown>) => boolean): number {
  for (let index = records.length - 1; index >= 0; index--) {
    if (predicate(records[index]!.value)) return index;
  }
  return -1;
}

/**
 * Read assistant prose from the active turn of a Claude Code, Codex, or Pi
 * JSONL session. Unknown records are ignored so vendor metadata can evolve.
 */
export async function readCurrentTurnTranscript(
  filePath: string,
  options: TranscriptReadOptions = {},
): Promise<TranscriptMessage[]> {
  const records = parseJsonLines(await readFile(filePath, 'utf8'));
  const looksClaude = records.some(({ value }) => value.type === 'assistant' && object(value.message)?.role === 'assistant');
  const looksCodex = records.some(({ value }) => value.type === 'response_item' || value.type === 'turn_context');
  const looksPi = records.some(({ value }) => value.type === 'message' && object(value.message)?.role !== undefined);

  let boundary = -1;
  let extract: (value: Record<string, unknown>) => string;
  if (looksCodex) {
    boundary = lastBoundary(records, (value) => codexBoundary(value, options.turnId));
    if (options.turnId && boundary < 0) {
      throw new Error(`could not find Codex turn ${options.turnId} in ${filePath}`);
    }
    extract = codexMessage;
  } else if (looksClaude) {
    boundary = lastBoundary(records, isHumanClaudeMessage);
    extract = claudeMessage;
  } else if (looksPi) {
    boundary = lastBoundary(records, piBoundary);
    extract = piMessage;
  } else {
    throw new Error(`unsupported agent transcript format: ${filePath}`);
  }

  const messages = records.slice(boundary + 1).flatMap(({ record, value }) => {
    const text = extract(value).trim();
    return text ? [{ record, text }] : [];
  });
  const maxMessages = options.maxMessages ?? 20;
  if (!Number.isInteger(maxMessages) || maxMessages < 1) throw new Error('maxMessages must be a positive integer');
  return messages.slice(-maxMessages);
}
