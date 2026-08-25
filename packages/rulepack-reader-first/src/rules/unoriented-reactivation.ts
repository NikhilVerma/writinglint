import { defineRule } from 'writinglint-core';
import { buildReadingTrace } from '../reading-trace.js';

/** A dropped entity or relationship returns after an intervening thread without reorientation. */
export const unorientedReactivation = defineRule({
  meta: {
    name: 'unoriented-reactivation',
    category: 'load',
    defaultSeverity: 'info',
    defaultConfidence: 'low',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'], regions: ['paragraph'] },
    docs: {
      description: 'A sentence resumes entities or relationships that have already left the active reading context.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const trace = buildReadingTrace(document);
        const reportedRelationships = new Set<string>();
        for (const moment of trace.moments) {
          if (moment.headingBoundaryBefore || moment.consolidationCues.includes('orientation')) continue;
          const sentence = document.sentences[moment.sentence];
          const properNames = new Set(sentence?.words
            .filter((token) => token.upos === 'PROPN')
            .map((token) => (token.lemma ?? token.lower).toLowerCase()) ?? []);
          const namedReactivations = moment.entityReactivations.filter((item) => properNames.has(item.key));
          const relationshipReactivations = moment.relationshipReactivations
            .filter((item) => !reportedRelationships.has(item.key));
          const namedRelationshipReturn = relationshipReactivations.length >= 1 && namedReactivations.length >= 2;
          // Repeated generic frames such as "you have" or "I said" are discourse
          // habits, not dormant threads. Without named participants, an exact
          // dependency-key match is too weak to claim reconstruction cost.
          if (!namedRelationshipReturn) continue;
          const maxGap = Math.max(
            0,
            ...namedReactivations.map((item) => item.inactiveSentences),
            ...relationshipReactivations.map((item) => item.inactiveSentences),
          );
          const entities = namedReactivations.map((item) => item.key);
          context.report({
            span: { start: moment.start, end: moment.end },
            confidence: 'medium',
            message: `This sentence resumes ${entities.length > 0 ? entities.join(', ') : 'an earlier relationship'} after ${maxGap} intervening sentences. Reorient the reader before changing that earlier thread.`,
            evidence: [{
              kind: 'unoriented-reactivation',
              data: {
                entities: entities.join(', '),
                relationships: relationshipReactivations.map((item) => item.key).join(', '),
                interveningSentences: maxGap,
              },
            }],
          });
          relationshipReactivations.forEach((item) => reportedRelationships.add(item.key));
        }
      },
    };
  },
});
