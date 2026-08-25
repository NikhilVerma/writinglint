import { defineRule } from 'writinglint-core';
import { buildReadingTrace, type ParticipantRole, type Proposition, type ReadingMoment } from '../reading-trace.js';

const MIN_RELATIONSHIPS = 6;
const MIN_DIRECTED_PAIRS = 4;
const MIN_ROLE_CHANGES = 3;
const MAX_PARTICIPANTS = 8;
const MAX_SENTENCES = 7;
const MAX_SPAN = 900;

interface RelationshipEvidence {
  relationships: number;
  participants: Set<string>;
  directedPairs: Set<string>;
  roleChanges: number;
}

function analyze(propositions: readonly Proposition[]): RelationshipEvidence {
  const participants = new Set<string>();
  const directedPairs = new Set<string>();
  const lastRoles = new Map<string, ParticipantRole>();
  let relationships = 0;
  let roleChanges = 0;

  for (const proposition of propositions) {
    for (const participant of [...proposition.subjects, ...proposition.objects]) {
      participants.add(participant.key);
      const previous = lastRoles.get(participant.key);
      if (previous && previous !== participant.role) roleChanges++;
      lastRoles.set(participant.key, participant.role);
    }
    for (const subject of proposition.subjects) {
      for (const object of proposition.objects) {
        relationships++;
        directedPairs.add(`${subject.key}->${object.key}`);
      }
    }
  }

  return { relationships, participants, directedPairs, roleChanges };
}

/** Several rapidly changing relationships among the same participants in one reading unit. */
export const relationshipPileup = defineRule({
  meta: {
    name: 'relationship-pileup',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['tokens', 'part-of-speech', 'dependencies'], regions: ['paragraph'] },
    docs: {
      description: 'A passage rapidly changes the relationships among a small set of participants.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const trace = buildReadingTrace(document);
        const propositionsBySentence = new Map<number, Proposition[]>();
        for (const proposition of trace.propositions) {
          const sentencePropositions = propositionsBySentence.get(proposition.sentence) ?? [];
          sentencePropositions.push(proposition);
          propositionsBySentence.set(proposition.sentence, sentencePropositions);
        }
        let start = 0;
        while (start < trace.moments.length) {
          const window: ReadingMoment[] = [];
          for (let index = start; index < trace.moments.length && window.length < MAX_SENTENCES; index++) {
            const moment = trace.moments[index]!;
            if (window.length > 0 && (moment.headingBoundaryBefore || trace.moments[index - 1]!.consolidationCues.length > 0)) break;
            if (window.length > 0 && moment.end - window[0]!.start > MAX_SPAN) break;
            window.push(moment);
          }
          const propositions = window.flatMap((moment) => propositionsBySentence.get(moment.sentence) ?? []);
          const evidence = analyze(propositions);
          if (evidence.relationships < MIN_RELATIONSHIPS
            || evidence.directedPairs.size < MIN_DIRECTED_PAIRS
            || evidence.roleChanges < MIN_ROLE_CHANGES
            || evidence.participants.size > MAX_PARTICIPANTS) {
            start++;
            continue;
          }

          context.report({
            span: { start: window[0]!.start, end: window.at(-1)!.end },
            confidence: evidence.relationships >= 9 && evidence.roleChanges >= 5 ? 'high' : 'medium',
            message: `This passage adds ${evidence.relationships} relationships among ${evidence.participants.size} participants while repeatedly changing their roles. Group the events into stages or explain which relationships the reader should retain.`,
            evidence: [{
              kind: 'relationship-pileup',
              data: {
                relationships: evidence.relationships,
                participants: [...evidence.participants].join(', '),
                directedPairs: evidence.directedPairs.size,
                roleChanges: evidence.roleChanges,
                propositions: propositions.length,
              },
            }],
          });
          start += window.length;
        }
      },
    };
  },
});
