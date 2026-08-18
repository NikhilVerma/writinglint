import { defineRule, type Document } from 'writinglint-core';
import { hasFiniteClauseBefore } from './sentence-shape.js';

const WORD_RE = /[\p{L}\p{N}]+/gu;
const PARENTHETICAL_RE = /\(([^()\n]{1,180})\)/g;
const CITATION_RE = /^(?:[A-Z][A-Za-z'-]+(?:\s+(?:and|&))?\s*)+,?\s*\d{4}[a-z]?(?:,\s*(?:p+\.?\s*)?\d+(?:[-–]\d+)?)?$/u;

interface Aside {
  start: number;
  end: number;
  words: number;
  kind: 'parenthetical' | 'dash';
}

function wordCount(text: string): number {
  return text.match(WORD_RE)?.length ?? 0;
}

function insideBoldLabel(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const before = text.slice(lineStart, offset);
  return (before.match(/\*\*/g)?.length ?? 0) % 2 === 1;
}

function collectParentheticals(document: Document): Aside[] {
  const asides: Aside[] = [];
  for (const match of document.text.matchAll(PARENTHETICAL_RE)) {
    const words = wordCount(match[1]!);
    if (words < 3 || CITATION_RE.test(match[1]!.trim()) || insideBoldLabel(document.text, match.index)) continue;
    asides.push({ start: match.index, end: match.index + match[0].length, words, kind: 'parenthetical' });
  }
  return asides;
}

function collectDashes(document: Document): Aside[] {
  const asides: Aside[] = [];
  for (const sentence of document.sentences) {
    const dashes = [...sentence.text.matchAll(/—/g)].map((match) => sentence.start + match.index);
    for (let index = 0; index < dashes.length; index += 2) {
      const start = dashes[index]!;
      if (insideBoldLabel(document.text, start) || !hasFiniteClauseBefore(sentence, start)) continue;
      const paired = dashes[index + 1];
      const end = paired ?? sentence.end;
      const contentStart = start + 1;
      const words = wordCount(document.text.slice(contentStart, end));
      if (words < 3) continue;
      asides.push({ start, end, words, kind: 'dash' });
    }
  }
  return asides;
}

/** Bracketed or dashed explanations that interrupt the sentence, with repetition escalating severity. */
export const asidePileup = defineRule({
  meta: {
    name: 'aside-pileup',
    category: 'economy',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech', 'dependencies'] },
    docs: {
      description: 'Explanations sit in brackets or after dashes instead of being stated directly, with nearby asides treated more severely.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const asides = [...collectParentheticals(document), ...collectDashes(document)]
          .sort((left, right) => left.start - right.start);
        let start = 0;
        while (start < asides.length) {
          let end = start + 1;
          while (end < asides.length && asides[end]!.start - asides[end - 1]!.end <= 500) end++;
          const cluster = asides.slice(start, end);
          const parentheses = cluster.filter((aside) => aside.kind === 'parenthetical').length;
          const dashes = cluster.length - parentheses;
          const single = cluster.length === 1;
          context.report({
            span: { start: cluster[0]!.start, end: cluster.at(-1)!.end },
            confidence: cluster.length >= 3 ? 'high' : cluster.length === 2 || cluster[0]!.words >= 6 ? 'medium' : 'low',
            message: single
              ? 'This explanation is tucked into brackets or after a dash. Put it in the main sentence if it matters; otherwise remove it.'
              : `${cluster.length} nearby bracketed or dashed explanations interrupt the main point. Put necessary facts in plain sentences and remove the rest.`,
            evidence: [{
              kind: 'aside-pileup',
              data: { asides: cluster.length, parentheses, dashes },
            }],
          });
          start = end;
        }
      },
    };
  },
});
