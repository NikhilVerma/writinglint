import { Linter, type Lint } from 'writinglint-core';
import { extractInput } from 'slopsift/extract';
import { buildReadingTrace } from 'writinglint-rulepack-reader-first';
import { loadEngine } from '../../../web/src/client/parser-browser.js';
import { configForRulepackPreset } from './rulepack-config.js';
import { normalizeRulepackPreset, type RulepackPreset } from './rulepack-selection.js';

export interface CognitiveMoment {
  sentence: number;
  start: number;
  end: number;
  text: string;
  introducedEntities: string[];
  releasedEntities: string[];
  newRelationships: number;
  releasedRelationships: number;
  activeEntities: string[];
  activeRelationships: string[];
  activeIdeas: string[];
  activeDecisionStandards: string[];
  roleChanges: number;
  pushes: number;
  pops: number;
  reactivations: number;
  netInflow: number;
  headingBoundaryBefore: boolean;
  consolidationCues: string[];
}

type Input = { type: 'lint'; id: number; text: string; path?: string; preset?: RulepackPreset };
type Output =
  | { type: 'progress'; stage: string; loaded?: number; total?: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; lints: Lint[]; wordCount: number; cognitiveMoments: CognitiveMoment[] }
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
    .then(({ lints, doc }) => post({
      type: 'result',
      id: message.id,
      wordCount: extracted.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0,
      cognitiveMoments: buildReadingTrace(doc).moments.map((moment) => {
        const [start, end] = extracted.sourceRange(moment.start, moment.end);
        return {
          sentence: moment.sentence,
          start,
          end,
          text: message.text.slice(start, end),
          introducedEntities: moment.introducedEntities,
          releasedEntities: moment.releasedEntities,
          newRelationships: moment.newRelationships.length,
          releasedRelationships: moment.releasedRelationships.length,
          activeEntities: moment.activeEntities,
          activeRelationships: moment.activeRelationships,
          activeIdeas: moment.activeIdeas.map((idea) => idea.label),
          activeDecisionStandards: moment.activeDecisionStandards.map((standard) => standard.term),
          roleChanges: moment.roleChanges.length,
          pushes: moment.load.pushes,
          pops: moment.load.pops,
          reactivations: moment.load.reactivations,
          netInflow: moment.load.netInflow,
          headingBoundaryBefore: moment.headingBoundaryBefore,
          consolidationCues: moment.consolidationCues,
        };
      }),
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
