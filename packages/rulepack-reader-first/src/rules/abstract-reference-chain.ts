import { defineRule, root as rootOf, type Sentence } from 'writinglint-core';

const ABSTRACT_CONTAINERS = new Set([
  'ability', 'approach', 'capability', 'change', 'concern', 'feature', 'flow',
  'gap', 'idea', 'issue', 'journey', 'matter', 'path', 'pattern', 'problem',
  'process', 'shape', 'solution', 'thing', 'type', 'way',
]);
const BARE_REFERENCES = new Set(['it', 'its', 'that', 'this', 'these', 'they', 'their', 'them', 'those', 'there']);
const GENERIC_COMPARISON_RE = /\b(?:all|both|each|they|them|these|those)\b[^.!?]{0,36}\b(?:same|similar|shape|pattern|kind|type)\b/i;
const EXPLICIT_RATIONALE_RE = /\bbecause\b/i;

interface Candidate {
  sentence: Sentence;
  score: number;
  abstractWords: string[];
  references: string[];
  comparison: boolean;
  existential: boolean;
}

function singular(lemma: string): string {
  if (lemma.endsWith('ies') && lemma.length > 4) return `${lemma.slice(0, -3)}y`;
  if (lemma.endsWith('s') && !lemma.endsWith('ss') && lemma.length > 3) return lemma.slice(0, -1);
  return lemma;
}

function candidateFor(sentence: Sentence, previous?: Sentence): Candidate | undefined {
  const abstractWords = sentence.words
    .map((token) => singular((token.lemma ?? token.lower).toLowerCase()))
    .filter((word) => ABSTRACT_CONTAINERS.has(word));
  const references = sentence.words
    .map((token) => token.lower)
    .filter((word) => BARE_REFERENCES.has(word));
  const comparison = GENERIC_COMPARISON_RE.test(sentence.text);
  const root = rootOf(sentence.dep);
  const nounRoot = root?.upos === 'NOUN' && abstractWords.includes(singular((root.lemma ?? root.form).toLowerCase()));
  const existential = /^\s*there\s+(?:is|are|was|were|has|have|had)\b/i.test(sentence.text)
    && !sentence.text.includes(':');
  const inheritedReferent = /^(?:it|they|this|that|these|those)\b/i.test(sentence.text.trim())
    && previous?.words.some((token) => ABSTRACT_CONTAINERS.has(singular((token.lemma ?? token.lower).toLowerCase()))) === true;
  const vagueRationale = EXPLICIT_RATIONALE_RE.test(sentence.text)
    && references.length >= 2
    && abstractWords.length >= 1;
  const score = abstractWords.length
    + references.length
    + (comparison ? 2 : 0)
    + (nounRoot ? 2 : 0)
    + (existential ? 1 : 0)
    + (inheritedReferent ? 1 : 0)
    + (vagueRationale ? 2 : 0);
  if (score < 3) return undefined;
  return { sentence, score, abstractWords, references, comparison, existential };
}

/** Several sentences that discuss abstract containers instead of naming the concrete facts. */
export const abstractReferenceChain = defineRule({
  meta: {
    name: 'abstract-reference-chain',
    category: 'directness',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'Nearby sentences keep referring to generic problems, shapes, paths, or capabilities instead of naming the concrete facts.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const candidates = document.sentences
          .map((sentence, index) => candidateFor(sentence, document.sentences[index - 1]))
          .filter((candidate): candidate is Candidate => candidate !== undefined);
        const consumed = new Set<number>();

        for (let index = 0; index < candidates.length; index++) {
          if (consumed.has(index)) continue;
          const cluster = [candidates[index]!];
          for (let next = index + 1; next < candidates.length; next++) {
            const prior = cluster.at(-1)!;
            const candidate = candidates[next]!;
            if (candidate.sentence.index - prior.sentence.index > 2
              || candidate.sentence.start - prior.sentence.end > 600) break;
            cluster.push(candidate);
            consumed.add(next);
          }

          const first = cluster[0]!;
          const last = cluster.at(-1)!;
          const denseSingle = cluster.length === 1 && (first.score >= 5 || first.existential);
          if (cluster.length < 2 && !denseSingle) continue;
          const abstractWords = [...new Set(cluster.flatMap((candidate) => candidate.abstractWords))];
          const referenceCount = cluster.reduce((total, candidate) => total + candidate.references.length, 0);
          const comparisonCount = cluster.filter((candidate) => candidate.comparison).length;
          context.report({
            span: { start: first.sentence.start, end: last.sentence.end },
            confidence: cluster.length >= 2 ? 'high' : 'medium',
            message: cluster.length >= 2
              ? `${cluster.length} nearby sentences hide the concrete facts behind abstract labels and vague references. State what changed, then list the facts directly.`
              : 'This sentence compresses the point into abstract labels and vague references. Name the concrete subject and say what it does.',
            evidence: [{
              kind: 'abstract-reference-chain',
              data: {
                sentences: cluster.length,
                abstractTerms: abstractWords.join(', '),
                references: referenceCount,
                genericComparisons: comparisonCount,
              },
            }],
          });
        }
      },
    };
  },
});
