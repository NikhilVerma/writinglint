import { defineRule, type DocumentRegion, type Sentence } from 'writinglint-core';
import { buildReadingTrace, canonicalEntityKey } from '../reading-trace.js';

interface OrderedStep {
  region: DocumentRegion;
  titleSentence?: Sentence;
  end: number;
}

const RESULT_CASES = new Set(['as', 'into']);
const GENERIC_STEP_NOUNS = new Set(['check', 'process', 'stage', 'step', 'thing']);

function nounsIn(sentence: Sentence | undefined): Set<string> {
  return new Set(sentence?.words
    .filter((token) => token.upos === 'NOUN' || token.upos === 'PROPN')
    .map(canonicalEntityKey)
    .filter((term) => term && !GENERIC_STEP_NOUNS.has(term)) ?? []);
}

function outputConcepts(sentence: Sentence | undefined): Set<string> {
  if (!sentence) return new Set();
  const resultComplements = sentence.dep.tokens.filter((token) => {
    if ((token.upos !== 'NOUN' && token.upos !== 'PROPN') || token.deprel.split(':', 1)[0] !== 'obl') return false;
    return sentence.dep.tokens.some((candidate) => candidate.head === token.id
      && candidate.deprel.split(':', 1)[0] === 'case'
      && RESULT_CASES.has((candidate.lemma ?? candidate.form).toLowerCase()));
  });
  if (resultComplements.length > 0) return new Set(resultComplements.map(canonicalEntityKey));
  const directObjects = sentence.dep.tokens.filter((token) =>
    (token.upos === 'NOUN' || token.upos === 'PROPN')
    && ['obj', 'iobj'].includes(token.deprel.split(':', 1)[0]!));
  return directObjects.length > 0
    ? new Set(directObjects.map(canonicalEntityKey))
    : nounsIn(sentence);
}

function orderedSteps(document: Parameters<typeof buildReadingTrace>[0]): OrderedStep[] {
  const regions = document.regions
    .filter((region) => region.role === 'list-item'
      && typeof region.metadata === 'object'
      && region.metadata !== null
      && (region.metadata as { ordered?: unknown }).ordered === true)
    .sort((left, right) => left.start - right.start);
  return regions.map((region, index) => ({
    region,
    titleSentence: document.sentences.find((sentence) => sentence.end > region.start
      && sentence.start < region.end
      && sentence.words.some((token) => token.upos === 'VERB' || token.upos === 'NOUN' || token.upos === 'PROPN')),
    end: regions[index + 1]?.start ?? document.text.length,
  }));
}

/** A numbered procedure leaves one thread, opens another, and then returns to the first. */
export const procedureThreadDetour = defineRule({
  meta: {
    name: 'procedure-thread-detour',
    category: 'load',
    defaultSeverity: 'info',
    defaultConfidence: 'low',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'], regions: ['list-item'] },
    docs: {
      description: 'Three numbered steps leave an output unused for one step and then resume it, suggesting that the middle step interrupts the procedure handoff.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const steps = orderedSteps(document);
        if (steps.length < 3) return;
        const trace = buildReadingTrace(document);
        for (let index = 0; index <= steps.length - 3; index++) {
          const before = steps[index]!;
          const middle = steps[index + 1]!;
          const after = steps[index + 2]!;
          const outputs = outputConcepts(before.titleSentence);
          const returns = nounsIn(after.titleSentence);
          const returned = [...outputs].filter((term) => returns.has(term));
          if (returned.length === 0) continue;
          const middleMoments = trace.moments
            .filter((moment) => moment.start >= middle.region.start && moment.start < middle.end)
            .slice(0, 3);
          const middleConcepts = new Set([
            ...nounsIn(middle.titleSentence),
            ...middleMoments.flatMap((moment) => [
              ...moment.introducedEntities,
              ...moment.reinforcedEntities,
              ...moment.reactivatedEntities,
            ]),
          ]);
          const missing = returned.filter((term) => !middleConcepts.has(term));
          if (missing.length === 0) continue;
          context.report({
            span: { start: middle.region.start, end: middle.titleSentence?.end ?? middle.region.end },
            confidence: 'low',
            message: `This numbered step interrupts the ${missing.join(', ')} thread produced by the previous step and resumed by the next one. State how this step consumes that output, or move it to where its input is available.`,
            evidence: [{
              kind: 'procedure-thread-detour',
              data: {
                previousStep: before.titleSentence?.text.trim() ?? '',
                middleStep: middle.titleSentence?.text.trim() ?? '',
                nextStep: after.titleSentence?.text.trim() ?? '',
                skippedConcepts: missing.join(', '),
              },
            }],
          });
        }
      },
    };
  },
});
