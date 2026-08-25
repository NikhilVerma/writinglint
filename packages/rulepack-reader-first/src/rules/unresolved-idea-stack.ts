import { defineRule } from 'writinglint-core';
import { buildReadingTrace } from '../reading-trace.js';

const STACK_SIZE = 3;
const LONG_DEFERRAL_SENTENCES = 8;

/** Explicit promises accumulate before the document fulfils them. */
export const unresolvedIdeaStack = defineRule({
  meta: {
    name: 'unresolved-idea-stack',
    category: 'load',
    defaultSeverity: 'info',
    defaultConfidence: 'low',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech'], regions: ['paragraph'] },
    docs: {
      description: 'The document asks the reader to retain several promised explanations or defers one for too long.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const trace = buildReadingTrace(document);
        for (const moment of trace.moments) {
          const oldest = moment.activeIdeas[0];
          if (!oldest) continue;
          const oldestAge = moment.sentence - oldest.sentence;
          if (moment.activeIdeas.length < STACK_SIZE && oldestAge < LONG_DEFERRAL_SENTENCES) continue;
          context.report({
            span: { start: oldest.start, end: moment.end },
            confidence: 'low',
            message: moment.activeIdeas.length >= STACK_SIZE
              ? `This passage leaves ${moment.activeIdeas.length} promised explanations open at once. Resolve or remove one before opening another.`
              : `This promised explanation remains open across ${oldestAge} sentences. Explain it sooner or remove the forward reference.`,
            evidence: [{
              kind: 'unresolved-idea-stack',
              data: {
                openIdeas: moment.activeIdeas.length,
                oldestAge,
                topics: moment.activeIdeas.flatMap((idea) => idea.topics).join(', '),
              },
            }],
          });
          return;
        }
      },
    };
  },
});
