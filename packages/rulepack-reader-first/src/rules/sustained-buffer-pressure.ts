import { defineRule } from 'writinglint-core';
import { buildReadingTrace, type ReadingMoment } from '../reading-trace.js';

const WINDOW_SENTENCES = 3;
const MIN_DOCUMENT_SENTENCES = 20;
const MIN_ACTIVE_FRAMES = 20;
const MIN_INFLOW = 8;
const MIN_ROLE_CHANGES = 4;
const MIN_OVERLOADED_WINDOWS = 3;
const MIN_OVERLOADED_RATE = 0.06;

interface WindowEvidence {
  moments: ReadingMoment[];
  activeFrames: number;
  inflow: number;
  roleChanges: number;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function crossesRelease(moments: readonly ReadingMoment[]): boolean {
  return moments.slice(1).some((moment) => moment.headingBoundaryBefore)
    || moments.slice(0, -1).some((moment) => moment.consolidationCues.length > 0);
}

function windowEvidence(moments: ReadingMoment[]): WindowEvidence {
  return {
    moments,
    activeFrames: average(moments.map((moment) =>
      moment.load.activeEntityFrames + moment.load.activeRelationshipFrames
      + moment.load.openIdeaFrames + moment.load.openDecisionFrames)),
    inflow: average(moments.map((moment) => moment.load.pushes + moment.load.reactivations)),
    roleChanges: moments.reduce((sum, moment) => sum + moment.load.roleChanges, 0),
  };
}

function overloaded(evidence: WindowEvidence): boolean {
  return evidence.activeFrames >= MIN_ACTIVE_FRAMES
    && evidence.inflow >= MIN_INFLOW
    && evidence.roleChanges >= MIN_ROLE_CHANGES;
}

/** Mixed entity, relationship, and churn pressure persists through a substantial part of the document. */
export const sustainedBufferPressure = defineRule({
  meta: {
    name: 'sustained-buffer-pressure',
    category: 'load',
    defaultSeverity: 'info',
    defaultConfidence: 'low',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'], regions: ['paragraph'] },
    docs: {
      description: 'The document repeatedly adds active entities and relationships faster than it releases or stabilizes them.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const trace = buildReadingTrace(document);
        if (trace.moments.length < MIN_DOCUMENT_SENTENCES) return;
        const eligible: WindowEvidence[] = [];
        for (let end = WINDOW_SENTENCES; end <= trace.moments.length; end++) {
          const moments = trace.moments.slice(end - WINDOW_SENTENCES, end);
          if (!crossesRelease(moments)) eligible.push(windowEvidence(moments));
        }
        const overloadedWindows = eligible.filter(overloaded);
        const rate = eligible.length > 0 ? overloadedWindows.length / eligible.length : 0;
        if (overloadedWindows.length < MIN_OVERLOADED_WINDOWS || rate < MIN_OVERLOADED_RATE) return;

        const ranked = [...overloadedWindows].sort((left, right) =>
          (right.activeFrames + right.inflow + right.roleChanges)
          - (left.activeFrames + left.inflow + left.roleChanges));
        const selected: WindowEvidence[] = [];
        for (const candidate of ranked) {
          const start = candidate.moments[0]!.sentence;
          const end = candidate.moments.at(-1)!.sentence;
          if (selected.some((item) => start <= item.moments.at(-1)!.sentence && end >= item.moments[0]!.sentence)) continue;
          selected.push(candidate);
          if (selected.length === 3) break;
        }

        for (const evidence of selected.sort((left, right) => left.moments[0]!.start - right.moments[0]!.start)) {
          context.report({
            span: { start: evidence.moments[0]!.start, end: evidence.moments.at(-1)!.end },
            confidence: 'low',
            message: `This passage sustains about ${Math.round(evidence.activeFrames)} active frames while adding ${evidence.inflow.toFixed(1)} per sentence and changing participant roles ${evidence.roleChanges} times. The same pressure recurs across ${Math.round(rate * 100)}% of this document. Consolidate or close one thread before adding another.`,
            evidence: [{
              kind: 'sustained-buffer-pressure',
              data: {
                activeFrames: Number(evidence.activeFrames.toFixed(1)),
                inflowPerSentence: Number(evidence.inflow.toFixed(1)),
                roleChanges: evidence.roleChanges,
                overloadedWindows: overloadedWindows.length,
                eligibleWindows: eligible.length,
                overloadedRate: Number(rate.toFixed(3)),
              },
            }],
          });
        }
      },
    };
  },
});
