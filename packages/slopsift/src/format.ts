import type { Lint } from 'writinglint-core';
import packageJson from '../package.json' with { type: 'json' };

export const RULESET_VERSION = `slopsift@${packageJson.version}`;

export interface Message extends Lint {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}
export interface Result {
  filePath: string;
  rulesetVersion: string;
  messages: Message[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  wordCount: number;
  findingsPerThousandWords: number;
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function location(text: string, offset: number): { line: number; column: number } {
  let line = 1, column = 1;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === '\n') { line++; column = 1; } else column++;
  }
  return { line, column };
}

export function makeResult(
  filePath: string,
  source: string,
  lints: Lint[],
  analyzedWordCount = countWords(source),
): Result {
  const messages = lints.map((lint) => ({
    ...lint,
    ...location(source, lint.start),
    ...Object.fromEntries(Object.entries(location(source, lint.end)).map(([key, value]) => [`end${key[0]!.toUpperCase()}${key.slice(1)}`, value])),
  })) as Message[];
  return {
    filePath,
    rulesetVersion: RULESET_VERSION,
    messages,
    errorCount: messages.filter((message) => message.severity === 'error').length,
    warningCount: messages.filter((message) => message.severity === 'warn').length,
    infoCount: messages.filter((message) => message.severity === 'info').length,
    wordCount: analyzedWordCount,
    findingsPerThousandWords: analyzedWordCount
      ? Number(((messages.length / analyzedWordCount) * 1000).toFixed(1))
      : 0,
  };
}

const eslintSeverity = { info: 0, warn: 1, error: 2 } as const;
const ruleUrl = (ruleId: string): string | undefined => {
  const [pack, name] = ruleId.split('/');
  if (pack === 'ai-style' && name) return `https://slopsift.dev/rules/${encodeURIComponent(name)}/`;
  if (pack === 'reader-first' && name) return `https://slopsift.dev/rules/${encodeURIComponent(name)}/`;
  return undefined;
};

/** ESLint-compatible numeric severity, with SlopSift's level and confidence retained. */
export function jsonResult(result: Result): object {
  return {
    ...result,
    messages: result.messages.map(({ severity, ...message }) => ({
      ...message,
      severity: eslintSeverity[severity],
      level: severity,
      ruleUrl: ruleUrl(message.ruleId),
    })),
  };
}

const commandEscape = (value: string): string => value
  .replace(/%/g, '%25')
  .replace(/\r/g, '%0D')
  .replace(/\n/g, '%0A');

const commandPropertyEscape = (value: string): string => commandEscape(value)
  .replace(/:/g, '%3A')
  .replace(/,/g, '%2C');

/** GitHub Actions workflow commands, one annotation per finding. */
export function github(results: Result[]): string {
  return results.flatMap((result) => result.messages.map((message) => {
    const command = message.severity === 'error' ? 'error' : message.severity === 'warn' ? 'warning' : 'notice';
    const properties = [
      `file=${commandPropertyEscape(result.filePath)}`,
      `line=${message.line}`,
      `col=${message.column}`,
      `endLine=${message.endLine}`,
      `endColumn=${message.endColumn}`,
      `title=${commandPropertyEscape(message.ruleId)}`,
    ].join(',');
    return `::${command} ${properties}::${commandEscape(message.message)}`;
  })).join('\n');
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const ansi = (code: string, value: string) => color ? `\u001b[${code}m${value}\u001b[0m` : value;

export function stylish(results: Result[]): string {
  const blocks: string[] = [];
  for (const result of results) {
    if (!result.messages.length) continue;
    const rows = result.messages.map((message) => {
      const where = `${message.line}:${message.column}`.padStart(9);
      const colour = message.severity === 'error' ? '31' : message.severity === 'warn' ? '33' : '36';
      return `  ${ansi('2', where)}  ${ansi(colour, message.severity.padEnd(7))}  ${message.message}  ${ansi('2', message.ruleId)}`;
    });
    blocks.push(`${ansi('1;4', result.filePath)}\n${rows.join('\n')}`);
  }
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
  const infos = results.reduce((sum, result) => sum + result.infoCount, 0);
  const total = errors + warnings + infos;
  if (total) blocks.push(ansi('1', `✖ ${total} finding${total === 1 ? '' : 's'} (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${infos} info)`));
  return blocks.join('\n\n');
}

interface CompactGroup {
  ruleId: string;
  severity: Message['severity'];
  messages: Array<{ filePath: string; message: Message }>;
}

/** Dense, location-free output for agents and other context-constrained consumers. */
export function compact(results: Result[]): string {
  const groups = new Map<string, CompactGroup>();
  const filesWithFindings = results.filter((result) => result.messages.length);
  for (const result of filesWithFindings) {
    for (const message of result.messages) {
      const key = `${message.severity}\0${message.ruleId}`;
      const group = groups.get(key);
      if (group) group.messages.push({ filePath: result.filePath, message });
      else groups.set(key, {
        ruleId: message.ruleId,
        severity: message.severity,
        messages: [{ filePath: result.filePath, message }],
      });
    }
  }
  const findings = [...groups.values()].reduce((total, group) => total + group.messages.length, 0);
  if (!findings) return '';
  const showFiles = filesWithFindings.length > 1;
  const lines = [
    `${findings} finding${findings === 1 ? '' : 's'} in ${groups.size} rule group${groups.size === 1 ? '' : 's'}.`,
  ];
  for (const group of groups.values()) {
    const first = group.messages[0]!.message;
    const message = first.message.replace(/\s+/g, ' ').trim();
    const concise = message.length > 140 ? `${message.slice(0, 139)}…` : message;
    const severity = group.severity === 'warn' ? 'warning' : group.severity;
    lines.push(`${group.ruleId} [${severity}] ×${group.messages.length} — ${concise}`);
    const examples = [...new Set(group.messages.map(({ filePath, message: finding }) => {
      const text = finding.text.replace(/\s+/g, ' ').trim();
      if (!text || text.length === 1) return '';
      const excerpt = text.length > 60 ? `${text.slice(0, 59)}…` : text;
      return `${showFiles ? `${filePath}: ` : ''}“${excerpt}”`;
    }).filter(Boolean))].slice(0, 3);
    const remaining = group.messages.length - examples.length;
    if (examples.length) {
      lines.push(`  Examples: ${examples.join('; ')}${remaining > 0 ? `; +${remaining} more` : ''}`);
    }
  }
  return lines.join('\n');
}

const modelSafeText = (value: string): string => value
  .replace(/\bSlopSift\b/gi, 'the writing check')
  .replace(/\b(?:ai-style|reader-first)\/[a-z0-9-]+\b/gi, 'this writing pattern')
  .replace(/\s+/g, ' ')
  .trim();

/** Plain-language model feedback with excerpts but no product names, rule IDs, or source locations. */
export function brief(results: Result[]): string {
  const groups = new Map<string, Message[]>();
  for (const result of results) {
    for (const message of result.messages) {
      const group = groups.get(message.ruleId);
      if (group) group.push(message);
      else groups.set(message.ruleId, [message]);
    }
  }
  if (!groups.size) return '';
  const lines = [`Review ${groups.size} writing pattern${groups.size === 1 ? '' : 's'}:`];
  for (const messages of groups.values()) {
    const first = messages[0]!;
    const note = modelSafeText(first.message);
    const excerpts = [...new Set(messages.map(({ text }) => modelSafeText(text)).filter((text) => text.length > 1))]
      .slice(0, 3)
      .map((text) => `“${text.length > 100 ? `${text.slice(0, 99)}…` : text}”`);
    lines.push(`- ${note}${excerpts.length ? ` Examples: ${excerpts.join('; ')}` : ''}`);
  }
  return lines.join('\n');
}
