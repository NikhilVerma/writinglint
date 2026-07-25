import { defineRule, type Sentence } from 'writinglint-core';

const OUTCOME_VERB = /^(?:accelerat|avoid|boost|cut|deliver|elevat|eliminat|enabl|enhanc|ensur|help|improv|increas|lower|maximi|minimi|offer|prevent|protect|rais|reduc|sav|simplif|strengthen|streamlin|transform|unlock)/;
const EVALUATIVE_ADJECTIVE = /^(?:better|comfortable|easy|easier|effective|efficient|faster|impressive|reliable|rewarding|robust|safe|safer|simple|simpler|strong|stronger|sustainable)$/;
const SUPPORT_RE = /\b(?:according to|appendix|benchmark|case study|dataset|experiment|figure|for example|for instance|log|logs|measured|measurement|sample|source|study|survey|table|test|trial)\b|https?:\/\/|\[\^?\d+\]/i;
const CAUSAL_RE = /\b(?:because|since|by (?:measuring|comparing|tracking|testing)|which (?:means|shows)|as measured by)\b/i;

function normalized(token: { form: string; lemma?: string }): string {
  return (token.lemma ?? token.form).toLowerCase().replace(/[^a-z]/g, '');
}

function isOutcomeClaim(sentence: Sentence): boolean {
  const predicates = sentence.dep.tokens.filter((token) =>
    ['root', 'conj', 'xcomp', 'ccomp', 'acl', 'advcl'].includes(token.deprel.split(':', 1)[0]!));
  return predicates.some((token) => {
    const word = normalized(token);
    if (token.upos === 'ADJ') {
      return EVALUATIVE_ADJECTIVE.test(word) && !/\bbetter\s+not\b/i.test(sentence.text);
    }
    if (token.upos !== 'VERB') return false;
    if (OUTCOME_VERB.test(word)) return true;
    if (!/^(?:keep|make)/.test(word)) return false;
    return sentence.dep.tokens.some((candidate) =>
      (candidate.upos === 'ADJ' || candidate.upos === 'ADV')
      && EVALUATIVE_ADJECTIVE.test(normalized(candidate)));
  });
}

function sentenceHasSupport(sentence: Sentence): boolean {
  if (SUPPORT_RE.test(sentence.text) || CAUSAL_RE.test(sentence.text)) return true;
  return sentence.dep.tokens.some((token) => token.upos === 'NUM' || /\d/.test(token.form));
}

const isListParagraph = (text: string): boolean =>
  text.split(/\r?\n/).filter((line) => line.trim()).some((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line));

/** Several nearby outcome claims with no measurement, source, example, or mechanism. */
export const claimEvidenceGap = defineRule({
  meta: {
    name: 'claim-evidence-gap',
    category: 'vague',
    docs: { description: 'Nearby prose stacks outcome claims without measurements, sources, examples, or a mechanism.' },
  },
  create(ctx) {
    const reported = new Set<number>();
    return {
      Paragraph(paragraph) {
        if (paragraph.sentences.length < 3 || isListParagraph(paragraph.text)) return;
        const claims = paragraph.sentences.filter((sentence) => isOutcomeClaim(sentence) && !sentenceHasSupport(sentence));
        if (claims.length < 3 || claims.length / paragraph.sentences.length < 0.4) return;
        for (const claim of claims) reported.add(claim.start);
        ctx.report({
          span: { start: claims[0]!.start, end: claims.at(-1)!.end },
          confidence: claims.length >= 4 ? 'medium' : 'low',
          message: `${claims.length} outcome claims appear together without a measurement, source, example, or mechanism. Support the claims or narrow them.`,
        });
      },
      DocumentExit(doc) {
        const sentences = doc.paragraphs
          .filter((paragraph) => !isListParagraph(paragraph.text))
          .flatMap((paragraph) => paragraph.sentences);
        for (let start = 0; start < sentences.length; start++) {
          const window = sentences.slice(start, start + 6);
          if (window.length < 4) continue;
          const claims = window.filter((sentence) =>
            isOutcomeClaim(sentence)
            && !sentenceHasSupport(sentence)
            && !reported.has(sentence.start));
          if (claims.length < 4 || claims.length / window.length < 0.6) continue;
          ctx.report({
            span: { start: claims[0]!.start, end: claims.at(-1)!.end },
            confidence: 'medium',
            message: `${claims.length} nearby outcome claims accumulate across paragraphs without a measurement, source, example, or mechanism. Support the claims or narrow them.`,
          });
          return;
        }
      },
    };
  },
});
