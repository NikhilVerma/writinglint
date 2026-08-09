import { defineRule, type Sentence } from 'writinglint-core';

const LIST_ITEM_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;
const MARKDOWN_HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const DECORATED_HEADING_RE = /^\s*[─━—-]{3,}\s*(.*?)\s*[─━—-]{3,}\s*$/;
const MAIN_CLAUSE_RELATIONS = new Set(['root', 'conj', 'parataxis', 'ccomp', 'advcl']);

interface Candidate {
  start: number;
  end: number;
}

function topLevelAt(text: string, offset: number): boolean {
  let parentheses = 0;
  let backtick = false;
  for (let index = 0; index < offset; index++) {
    const character = text[index];
    if (character === '`') backtick = !backtick;
    else if (!backtick && character === '(') parentheses++;
    else if (!backtick && character === ')' && parentheses > 0) parentheses--;
  }
  return parentheses === 0 && !backtick;
}

function hasMainClause(sentence: Sentence): boolean {
  return sentence.dep.tokens.some((token) => {
    if (!topLevelAt(sentence.text, token.start - sentence.start)) return false;
    if (token.upos === 'AUX') return true;
    return token.upos === 'VERB' && MAIN_CLAUSE_RELATIONS.has(token.deprel);
  });
}

function explanatoryFragment(sentence: Sentence): boolean {
  const words = sentence.words.length;
  if (words < 7 || words > 32) return false;
  if (!/[.!?:]\s*$/.test(sentence.text.trim())) return false;
  return !hasMainClause(sentence);
}

/** An explanation that opens with a compressed label instead of a statement. */
export const headlineFragment = defineRule({
  meta: {
    name: 'headline-fragment',
    category: 'rhythm',
    docs: {
      description: 'An explanatory passage opens with a noun-heavy headline fragment instead of a complete statement.',
    },
  },
  create(ctx) {
    return {
      Document(doc) {
        const candidates: Candidate[] = [];
        for (const paragraph of doc.paragraphs) {
          const trimmed = paragraph.text.trimStart();
          if (MARKDOWN_HEADING_RE.test(trimmed) || LIST_ITEM_RE.test(trimmed)) continue;
          const first = paragraph.sentences[0];
          if (first && explanatoryFragment(first)) {
            candidates.push({ start: first.start, end: first.end });
          }

          const firstLine = paragraph.text.split(/\r?\n/, 1)[0] ?? '';
          const lineOffset = paragraph.text.indexOf(firstLine);
          const cleaned = firstLine.replace(/^\s*\*+\s?/, '');
          const decorated = cleaned.match(DECORATED_HEADING_RE)?.[1]?.trim();
          if (decorated && (decorated.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) >= 3) {
            const contentOffset = firstLine.indexOf(decorated);
            const start = paragraph.start + lineOffset + Math.max(contentOffset, 0);
            candidates.push({ start, end: start + decorated.length });
          }
        }

        const unique = [...new Map(candidates.map((candidate) => [`${candidate.start}:${candidate.end}`, candidate])).values()];
        for (const candidate of unique) {
          ctx.report({
            span: candidate,
            confidence: 'low',
            message: 'Headline-style fragment: this passage opens with a label instead of explaining what the subject does. '
              + 'Start with the purpose or normal behavior, then introduce the implementation label.',
          });
        }
      },
    };
  },
});
