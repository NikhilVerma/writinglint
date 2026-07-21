import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { strict } from 'writinglint-rulepack-ai-style';
import { extractInput } from 'slopsift/extract';
import { loadEngine } from '../../../web/src/client/parser-browser.js';

type Input = { type: 'lint'; id: number; text: string; path?: string };
type Output =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[]; wordCount: number }
  | { type: 'error'; id?: number; message: string };

const post = (message: Output) =>
  (self as unknown as { postMessage(value: Output): void }).postMessage(message);

const config = resolveConfig(strict);
let linter: Linter | undefined;

void loadEngine((stage, loaded, total) => post({ type: 'progress', stage, loaded, total }))
  .then(({ parser }) => {
    linter = new Linter(parser);
    post({ type: 'ready' });
  })
  .catch((error: Error) => post({ type: 'error', message: error.message }));

self.addEventListener('message', (event) => {
  const message = (event as MessageEvent<Input>).data;
  if (message.type !== 'lint' || !linter) return;
  const extracted = extractInput(message.path ?? 'draft.txt', message.text);
  void linter.lint(extracted.text, config)
    .then(({ lints }) => post({
      type: 'result',
      id: message.id,
      wordCount: extracted.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0,
      lints: lints.map((lint) => {
        const [start, end] = extracted.sourceRange(lint.start, lint.end);
        const fixRange = lint.fix ? extracted.sourceRange(lint.fix.range[0], lint.fix.range[1]) : undefined;
        return {
          ...lint,
          start,
          end,
          text: message.text.slice(start, end),
          fix: lint.fix ? { ...lint.fix, range: fixRange! } : undefined,
        };
      }),
    }))
    .catch((error: Error) => post({ type: 'error', id: message.id, message: error.message }));
});
