import { defineRule, type Paragraph } from 'writinglint-core';

const INLINE_CODE_RE = /`([^`\n]+)`/g;
const CODE_IDENTIFIER_RE = /\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[A-Z]\d+|[a-z][a-z0-9]*_[a-z0-9_]+)\b/g;
const QUALIFIER_RE = /\b(?:otherwise|unless|except|fallback|legacy|rather than|only|never|no|same|above|below|per(?:-criterion)?|exact|capped|at all|most recent|free-form)\b/gi;
const PROCESS_QUALIFIER_RE = /\b(?:otherwise|unless|except|fallback|rather than|only|never|no|not|nothing|cannot|if|because|instead|before|after|still|already|would|empty|unfiltered|same|worse|better)\b/gi;
const INTERNAL_LABEL_RE = /\b(?:[A-Z]{3,}|[A-Z]{2,}(?:-[A-Z]{2,})+)\b/g;
const ABSTRACT_PROCESS_RE = /\b(?:(?:this|the)\s+(?:helper|function|method|plan|process|workflow|step|stage|logic|path|retrieval|ranking|filter)|(?:narrowing|ranking|filtering|matching|retrieval|selection|lookup)\s+(?:is|keeps|returns|uses|narrows|filters))\b/gi;

function maskedInlineCode(text: string): { masked: string; references: number } {
  const output = [...text];
  let references = 0;
  for (const match of text.matchAll(INLINE_CODE_RE)) {
    const body = match[1] ?? '';
    const identifiers = body.match(CODE_IDENTIFIER_RE)?.length ?? 0;
    references += Math.max(1, identifiers);
    for (let index = match.index; index < match.index + match[0].length; index++) output[index] = ' ';
  }
  return { masked: output.join(''), references };
}

function countMatches(text: string, expression: RegExp): number {
  return [...text.matchAll(expression)].length;
}

interface PileupEvidence {
  references: number;
  qualifiers: number;
  processQualifiers: number;
  clauseBreaks: number;
  internalLabels: number;
  abstractProcesses: number;
}

function paragraphEvidence(paragraph: Paragraph): PileupEvidence {
  const { masked, references: inlineReferences } = maskedInlineCode(paragraph.text);
  const references = inlineReferences + countMatches(masked, CODE_IDENTIFIER_RE);
  const qualifiers = countMatches(masked, QUALIFIER_RE);
  const processQualifiers = countMatches(masked, PROCESS_QUALIFIER_RE);
  const internalLabels = countMatches(masked, INTERNAL_LABEL_RE);
  const abstractProcesses = countMatches(masked, ABSTRACT_PROCESS_RE);
  const parentheses = countMatches(masked, /\([^()\n]{1,180}\)/g);
  const commas = countMatches(masked, /,/g);
  const clauseBreaks = parentheses
    + countMatches(masked, /—/g)
    + countMatches(masked, /;/g)
    + countMatches(masked, /:(?=\s|$)/g)
    + Math.floor(commas / 2);
  return { references, qualifiers, processQualifiers, clauseBreaks, internalLabels, abstractProcesses };
}

function structuredBlock(text: string): boolean {
  if (text.includes('\u2029')) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const structured = lines.filter((line) => /^(?:[-*+]\s+|\d+[.)]\s+|\|)/.test(line)).length;
  return structured / lines.length >= 0.75;
}

/** Identifiers, qualifiers, and exceptions compressed into one explanation block. */
export const implementationDetailPileup = defineRule({
  meta: {
    name: 'implementation-detail-pileup',
    category: 'meta',
    docs: {
      description: 'A passage piles up identifiers, qualifications, and exceptions before establishing the normal behavior.',
    },
  },
  create(ctx) {
    return {
      Paragraph(paragraph) {
        if (structuredBlock(paragraph.text)) return;
        const words = paragraph.sentences.reduce((sum, sentence) => sum + sentence.words.length, 0);
        if (words < 28) return;
        const evidence = paragraphEvidence(paragraph);
        const dense = evidence.references >= 4 && evidence.qualifiers >= 2 && evidence.clauseBreaks >= 3;
        const qualifierHeavy = evidence.references >= 3 && evidence.qualifiers >= 4 && evidence.clauseBreaks >= 3;
        const processHeavy = words >= 55
          && evidence.processQualifiers >= 7
          && evidence.clauseBreaks >= 4
          && ((evidence.internalLabels >= 2 && evidence.internalLabels <= 8) || evidence.abstractProcesses >= 2);
        if (!dense && !qualifierHeavy && !processHeavy) return;
        const processOnly = processHeavy && !dense && !qualifierHeavy;
        const evidenceLead = processOnly
          ? `${evidence.internalLabels} internal labels, ${evidence.abstractProcesses} abstract process subjects, `
          : `${evidence.references} code or schema references, `;
        const qualificationCount = processOnly ? evidence.processQualifiers : evidence.qualifiers;
        ctx.report({
          span: { start: paragraph.start, end: paragraph.end },
          confidence: 'medium',
          message: `Compressed implementation explanation: ${evidenceLead}`
            + `${qualificationCount} conditions or qualifications, and ${evidence.clauseBreaks} asides or clause breaks are packed into one block. `
            + 'State the purpose and normal behavior first, then introduce field names and exceptions one at a time.',
        });
      },
    };
  },
});
