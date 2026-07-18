import { Linter, resolveConfig, type Lint } from 'writinglint-core';
import { strict } from 'writinglint-rulepack-ai-style';
import { loadEngine } from '../../../web/src/client/parser-browser.js';

type Input = { type: 'lint'; id: number; text: string };
type Output =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[] }
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
  void linter.lint(message.text, config)
    .then(({ lints }) => post({ type: 'result', id: message.id, lints }))
    .catch((error: Error) => post({ type: 'error', id: message.id, message: error.message }));
});
