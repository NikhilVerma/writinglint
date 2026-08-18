import { defineRule, type Document, type Sentence } from 'writinglint-core';
import { isFragmentSentence, linePrefix, overlapsRegion } from './sentence-shape.js';

const EXCLUDED_ROLES = new Set(['code', 'heading', 'list-item', 'metadata', 'quotation']);
const STRUCTURAL_PREFIX_RE = /^\s*(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+)/u;
const BOLD_LABEL_RE = /^\s*\*\*[^*]{2,100}\*\*/u;

function isProseFragment(document: Document, sentence: Sentence): boolean {
  if (!isFragmentSentence(sentence) || overlapsRegion(document, sentence, EXCLUDED_ROLES)) return false;
  if (STRUCTURAL_PREFIX_RE.test(sentence.text)) return false;
  const prefix = linePrefix(document, sentence);
  if (STRUCTURAL_PREFIX_RE.test(prefix)) return false;
  const paragraph = document.paragraphs.find((candidate) =>
    sentence.start >= candidate.start && sentence.start < candidate.end);
  if (paragraph?.sentences[0]?.index === sentence.index && BOLD_LABEL_RE.test(paragraph.text)) return false;
  return true;
}

/** Nearby subjectless fragments that make the reader infer who did what. */
export const fragmentChain = defineRule({
  meta: {
    name: 'fragment-chain',
    category: 'directness',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'Several nearby prose fragments omit their subjects or main clauses and read like compressed notes.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const fragments = document.sentences.filter((sentence) => isProseFragment(document, sentence));
        let start = 0;
        while (start < fragments.length) {
          let end = start + 1;
          while (end < fragments.length
            && fragments[end]!.index - fragments[end - 1]!.index <= 2
            && fragments[end]!.start - fragments[end - 1]!.end <= 450) end++;
          const cluster = fragments.slice(start, end);
          if (cluster.length >= 2) {
            context.report({
              span: { start: cluster[0]!.start, end: cluster.at(-1)!.end },
              confidence: cluster.length >= 3 ? 'high' : 'medium',
              message: `${cluster.length} nearby sentences are compressed fragments. Name the subject and state the action in each sentence.`,
              evidence: [{ kind: 'fragment-chain', data: { fragments: cluster.length } }],
            });
          }
          start = end;
        }
      },
    };
  },
});
