import { childrenOf, defineRule, type Document, type Sentence } from 'writinglint-core';

const PARAGRAPH_LABEL_RE = /^\s*\*\*([^*\n]{1,100}?)\*\*/u;
const LIST_LABEL_RE = /^\s{0,3}(?:[-+*]|\d+[.)])\s+\*\*([^*\n]{1,100}?)\*\*/gmu;

interface Candidate {
  start: number;
  end: number;
}

function sentenceAt(document: Document, offset: number): Sentence | undefined {
  return document.sentences.find((sentence) => offset >= sentence.start && offset < sentence.end);
}

function isCompleteClause(sentence: Sentence, labelStart: number, labelEnd: number): boolean {
  const labelTokens = sentence.dep.tokens.filter((token) =>
    token.start >= labelStart && token.end <= labelEnd && token.upos !== 'PUNCT');
  return labelTokens.some((token) => {
    if (token.upos !== 'VERB' && token.upos !== 'AUX') return false;
    const subjects = childrenOf(sentence.dep, token.id).filter((child) =>
      (child.deprel === 'nsubj' || child.deprel.startsWith('nsubj:')) && child.end <= labelEnd);
    if (subjects.length === 0) return false;
    const form = token.form.toLowerCase();
    return token.upos === 'AUX'
      || form.endsWith('s')
      || form.endsWith('ed')
      || form.endsWith('en')
      || subjects.some((subject) => subject.form.toLowerCase().endsWith('s'));
  });
}

function candidate(document: Document, start: number, end: number, label: string): Candidate | undefined {
  const words = label.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (words < 1 || words > 9) return undefined;
  const sentence = sentenceAt(document, start);
  if (!sentence || isCompleteClause(sentence, start, end)) return undefined;
  return { start, end };
}

function collectCandidates(document: Document): Candidate[] {
  const candidates: Candidate[] = [];
  for (const paragraph of document.paragraphs) {
    const match = paragraph.text.match(PARAGRAPH_LABEL_RE);
    if (!match) continue;
    const localStart = paragraph.text.indexOf('**');
    const start = paragraph.start + localStart;
    const end = start + match[0].trimStart().length;
    const found = candidate(document, start, end, match[1]!);
    if (found) candidates.push(found);
  }
  for (const match of document.text.matchAll(LIST_LABEL_RE)) {
    const boldOffset = match[0].indexOf('**');
    const start = match.index + boldOffset;
    const end = match.index + match[0].length;
    const found = candidate(document, start, end, match[1]!);
    if (found) candidates.push(found);
  }
  return [...new Map(candidates.map((item) => [`${item.start}:${item.end}`, item])).values()]
    .sort((left, right) => left.start - right.start);
}

/** Repeated bold fragments that label explanations instead of stating the point. */
export const labelLedExplanation = defineRule({
  meta: {
    name: 'label-led-explanation',
    category: 'directness',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'Nearby paragraphs or list items repeatedly open with bold headline fragments before explaining the concrete behavior.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const candidates = collectCandidates(document);
        let start = 0;
        while (start < candidates.length) {
          let end = start + 1;
          while (end < candidates.length && candidates[end]!.start - candidates[end - 1]!.end <= 1_800) end++;
          const cluster = candidates.slice(start, end);
          if (cluster.length >= 2) {
            context.report({
              span: { start: cluster[0]!.start, end: cluster.at(-1)!.end },
              confidence: cluster.length >= 3 ? 'high' : 'medium',
              message: `${cluster.length} nearby explanations start with bold labels instead of statements. Remove the labels and lead with what changed.`,
              evidence: [{ kind: 'label-led-explanation', data: { labels: cluster.length } }],
            });
          }
          start = end;
        }
      },
    };
  },
});
