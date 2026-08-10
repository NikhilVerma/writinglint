import { Linter, type Lint } from 'writinglint-core';
import {
  assessAsdSte100Issue9,
  type AsdSte100Issue9Assessment,
} from 'writinglint-rulepack-technical-english';
import { extractInput } from 'slopsift/extract';
import { loadEngine } from '../../../web/src/client/parser-browser.js';
import { configForRulepackPreset } from './rulepack-config.js';
import { normalizeRulepackPreset, type RulepackPreset } from './rulepack-selection.js';

type Input = { type: 'lint'; id: number; text: string; path?: string; preset?: RulepackPreset };
type Output =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[]; wordCount: number; standardAssessment?: AsdSte100Issue9Assessment }
  | { type: 'error'; id?: number; message: string };

const post = (message: Output) =>
  (self as unknown as { postMessage(value: Output): void }).postMessage(message);

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
  const preset = normalizeRulepackPreset(message.preset);
  void linter.lint(extracted.text, configForRulepackPreset(preset))
    .then(({ lints }) => post({
      type: 'result',
      id: message.id,
      wordCount: extracted.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0,
      standardAssessment: preset === 'ai-style' ? undefined : assessAsdSte100Issue9(lints),
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
