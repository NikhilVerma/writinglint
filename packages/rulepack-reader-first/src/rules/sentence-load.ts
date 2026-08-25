import { countSentenceUnits, defineRule, type CountPolicy, type Sentence } from 'writinglint-core';

export interface SentenceLoadOptions {
  countPolicy?: CountPolicy;
  reviewWords?: number;
  warningWords?: number;
}

const CLAUSE_BREAK_RE = /[,;:]|\b(?:although|because|but|except|if|unless|when|whereas|which|while)\b/gi;
const SPLIT_BOUNDARY_RE = /[;:—]|,\s+(?=(?:and|but|so|yet)\b)|\b(?:although|because|but|except|if|unless|when|whereas|which|while)\b/gi;
const TECHNICAL_LABEL_RE = /`[^`\n]+`|\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*_[a-z0-9_]+|[A-Z][A-Z0-9-]{2,})\b/g;
const PUNCTUATION_LOAD_RE = /[;:]|—|\([^()\n]{3,}\)/g;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

interface Candidate {
  sentence: Sentence;
  words: number;
  clauseBreaks: number;
  labels: number;
  punctuation: number;
  hardLength: boolean;
  complex: boolean;
}

function labelCount(sentence: Sentence): number {
  const lexical = [...sentence.text.matchAll(TECHNICAL_LABEL_RE)].length;
  const properNames = sentence.words.filter((token, index) => token.upos === 'PROPN' && index > 0).length;
  return lexical + properNames;
}

function splitAnchors(sentence: Sentence): Array<{ kind: string; offset: number; label: string }> {
  return [...sentence.text.matchAll(SPLIT_BOUNDARY_RE)].flatMap((match) => {
    const localOffset = match.index! + (/^[;:—,]/.test(match[0]) ? match[0].length : 0);
    const before = sentence.text.slice(0, localOffset).match(WORD_RE)?.length ?? 0;
    const after = sentence.text.slice(localOffset).match(WORD_RE)?.length ?? 0;
    if (before < 6 || after < 6) return [];
    return [{
      kind: 'split-point',
      offset: sentence.start + localOffset,
      label: match[0].trim() || 'clause boundary',
    }];
  });
}

/** Sentences whose length, clauses, labels, or punctuation hide the main point. */
export const sentenceLoad = defineRule<SentenceLoadOptions>({
  meta: {
    name: 'sentence-load',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech'] },
    docs: {
      description: 'A sentence combines enough length, clauses, labels, or asides to overload the main point.',
    },
  },
  create(context) {
    const candidates: Candidate[] = [];
    const reviewWords = context.options.reviewWords ?? 24;
    const warningWords = context.options.warningWords ?? 32;
    return {
      Sentence(sentence) {
        const words = countSentenceUnits(sentence, context.doc, context.options.countPolicy).length;
        if (words < reviewWords) return;
        const clauseBreaks = [...sentence.text.matchAll(CLAUSE_BREAK_RE)].length;
        const labels = labelCount(sentence);
        const punctuation = [...sentence.text.matchAll(PUNCTUATION_LOAD_RE)].length;
        const hardLength = words >= warningWords;
        const complex = clauseBreaks >= 4
          || (clauseBreaks >= 3 && labels >= 1)
          || (clauseBreaks >= 2 && punctuation >= 2)
          || labels + punctuation >= 5;
        const review = clauseBreaks >= 2 || labels >= 2 || punctuation >= 1;
        if (!hardLength && !complex && !review) return;
        candidates.push({ sentence, words, clauseBreaks, labels, punctuation, hardLength, complex });
      },
      DocumentExit() {
        for (const candidate of candidates) {
          const localCount = candidates.filter((other) =>
            Math.abs(other.sentence.index - candidate.sentence.index) <= 2
            && Math.abs(other.sentence.start - candidate.sentence.start) <= 700).length;
          const confidence = candidate.words >= 45 || (localCount >= 3 && (candidate.hardLength || candidate.complex))
            ? 'high'
            : candidate.hardLength || candidate.complex || localCount >= 2 ? 'medium' : 'low';
          context.report({
            span: { start: candidate.sentence.start, end: candidate.sentence.end },
            confidence,
            message: `This sentence has ${candidate.words} words, ${candidate.clauseBreaks} clause breaks, ${candidate.labels} technical labels, and ${candidate.punctuation} heavy punctuation marks. ${localCount >= 2 ? `${localCount} nearby sentences carry similar load. ` : ''}State the main point, then move conditions or explanations into separate sentences.`,
            anchors: splitAnchors(candidate.sentence),
            magnitude: {
              metrics: [
                { name: 'words', value: candidate.words, unit: 'words', threshold: warningWords, excess: Math.max(0, candidate.words - warningWords) },
                { name: 'clause-breaks', value: candidate.clauseBreaks, unit: 'boundaries', threshold: 4, excess: Math.max(0, candidate.clauseBreaks - 4) },
                { name: 'technical-labels', value: candidate.labels, unit: 'labels', threshold: 2, excess: Math.max(0, candidate.labels - 2) },
                { name: 'heavy-punctuation', value: candidate.punctuation, unit: 'marks', threshold: 1, excess: Math.max(0, candidate.punctuation - 1) },
                { name: 'nearby-loaded-sentences', value: localCount, unit: 'sentences', threshold: 2, excess: Math.max(0, localCount - 2) },
              ],
            },
            evidence: [{
              kind: 'sentence-load',
              data: {
                words: candidate.words,
                clauseBreaks: candidate.clauseBreaks,
                technicalLabels: candidate.labels,
                punctuation: candidate.punctuation,
                nearbyLoadedSentences: localCount,
                reviewWords,
                warningWords,
              },
            }],
          });
        }
      },
    };
  },
});
