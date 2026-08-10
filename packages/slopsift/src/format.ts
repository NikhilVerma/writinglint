import type { Lint } from 'writinglint-core';
import type { StandardAssessment } from './index.js';

export interface Message extends Lint {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}
export interface Result {
  filePath: string;
  messages: Message[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  wordCount: number;
  findingsPerThousandWords: number;
  standardAssessment?: StandardAssessment;
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
  standardAssessment?: StandardAssessment,
): Result {
  const messages = lints.map((lint) => ({
    ...lint,
    ...location(source, lint.start),
    ...Object.fromEntries(Object.entries(location(source, lint.end)).map(([key, value]) => [`end${key[0]!.toUpperCase()}${key.slice(1)}`, value])),
  })) as Message[];
  return {
    filePath,
    messages,
    errorCount: messages.filter((message) => message.severity === 'error').length,
    warningCount: messages.filter((message) => message.severity === 'warn').length,
    infoCount: messages.filter((message) => message.severity === 'info').length,
    wordCount: analyzedWordCount,
    findingsPerThousandWords: analyzedWordCount
      ? Number(((messages.length / analyzedWordCount) * 1000).toFixed(1))
      : 0,
    standardAssessment,
  };
}

const eslintSeverity = { info: 0, warn: 1, error: 2 } as const;
const ruleUrl = (ruleId: string): string | undefined => {
  const [pack, name] = ruleId.split('/');
  if (pack === 'ai-style' && name) return `https://slopsift.dev/rules/${encodeURIComponent(name)}/`;
  if (pack === 'technical-english' && name) return 'https://www.asd-ste100.org/';
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
  for (const result of results) {
    const assessment = result.standardAssessment;
    if (!assessment) continue;
    const detail = assessment.status === 'nonconformant'
      ? `${assessment.automatedRuleFindings} automated rule finding${assessment.automatedRuleFindings === 1 ? '' : 's'}`
      : assessment.automatedRuleFindings
        ? `${assessment.automatedRuleFindings} warning finding${assessment.automatedRuleFindings === 1 ? '' : 's'} and the remaining rules require review`
        : 'no reported violations; dictionary and human review remain';
    blocks.push(`${result.filePath}: ASD-STE100 Issue ${assessment.issue} ${assessment.status} (${detail})`);
  }
  const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
  const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
  const infos = results.reduce((sum, result) => sum + result.infoCount, 0);
  const total = errors + warnings + infos;
  if (total) blocks.push(ansi('1', `✖ ${total} finding${total === 1 ? '' : 's'} (${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${infos} info)`));
  return blocks.join('\n\n');
}
