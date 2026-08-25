import { defineRule } from 'writinglint-core';
import { buildReadingTrace } from '../reading-trace.js';

const MIN_OPEN_STANDARDS = 4;

/** Several decisions depend on judgment words whose operational meaning remains open. */
export const undefinedDecisionStack = defineRule({
  meta: {
    name: 'undefined-decision-stack',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries'], regions: ['paragraph'] },
    docs: {
      description: 'The document accumulates decision standards such as relevant or sufficient without saying how a reader or system should apply them.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const trace = buildReadingTrace(document);
        const moment = trace.moments.find((item) => item.activeDecisionStandards.length >= MIN_OPEN_STANDARDS);
        if (!moment) return;
        const standards = moment.activeDecisionStandards;
        const oldest = standards.reduce((first, item) => item.start < first.start ? item : first);
        context.report({
          span: { start: oldest.start, end: moment.end },
          confidence: standards.length >= 6 ? 'high' : 'medium',
          message: `This document now relies on ${standards.length} undefined decision standards (${standards.map((item) => item.term).join(', ')}). State the observable rule for each judgment before using it to accept, reject, rank, or generate something.`,
          evidence: standards.map((standard) => ({
            kind: 'undefined-decision-standard',
            span: { start: standard.start, end: standard.end },
            data: { term: standard.term, introducedAtSentence: standard.sentence },
          })),
        });
      },
    };
  },
});
