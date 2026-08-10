import { defineRule, type DepToken, type TerminologyProvider } from 'writinglint-core';
import type {
  AsdSte100Issue9StandardData,
  TerminologyPartOfSpeech,
} from '../standard-data.js';
import { asdSte100TerminologyProvider } from '../standard-data.js';

export interface DictionaryOptions {
  /** Generic provider for other standards, industries, or local glossaries. */
  provider?: TerminologyProvider;
  /** Backward-compatible local Issue 9 dataset adapter. */
  standardData?: AsdSte100Issue9StandardData;
}

const TOKEN_PART_OF_SPEECH: Partial<Record<string, TerminologyPartOfSpeech>> = {
  NOUN: 'noun',
  PROPN: 'noun',
  VERB: 'verb',
  AUX: 'verb',
  ADJ: 'adjective',
  ADV: 'adverb',
  ADP: 'preposition',
  CCONJ: 'conjunction',
  SCONJ: 'conjunction',
  PRON: 'pronoun',
  DET: 'article',
};

function configuredProvider(
  options: DictionaryOptions,
  service: TerminologyProvider | undefined,
): TerminologyProvider | undefined {
  return service ?? options.provider
    ?? (options.standardData ? asdSte100TerminologyProvider(options.standardData) : undefined);
}

function parsedPartOfSpeech(token: DepToken): TerminologyPartOfSpeech | undefined {
  if (token.deprel === 'amod') return 'adjective';
  if (token.upos === 'DET') {
    return /^(?:a|an|the)$/iu.test(token.form) ? 'article' : 'adjective';
  }
  return TOKEN_PART_OF_SPEECH[token.upos];
}

export const dictionaryWordApproval = defineRule<DictionaryOptions>({
  meta: {
    name: 'dictionary-word-approval',
    category: 'technical-words',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    requires: { parser: ['tokens'] },
    docs: {
      description: 'Report a dictionary word when every matching Issue 9 entry marks it as unapproved.',
    },
  },
  create(context) {
    const provider = configuredProvider(context.options, context.services.terminology);
    return {
      Token(token) {
        const matches = provider?.lookup(token.text, { language: context.doc.language }) ?? [];
        if (!matches.length || matches.some(({ record }) => record.status !== 'unapproved')) return;
        const source = matches[0]!.record.provenance;
        context.report({
          span: { start: token.start, end: token.end },
          message: `“${token.text}” is listed as unapproved by ${source.source}${source.page ? ` (page ${source.page})` : ''}.`,
          suggestion: 'Choose an approved word that preserves the intended meaning, or record an applicable technical term.',
          evidence: [{
            kind: 'terminology-match',
            span: { start: token.start, end: token.end },
            data: {
              provider: matches[0]!.providerId,
              layer: matches[0]!.layer,
              record: matches[0]!.record.id,
              status: matches[0]!.record.status,
            },
          }],
        });
      },
    };
  },
});

export const dictionaryPartOfSpeech = defineRule<DictionaryOptions>({
  meta: {
    name: 'dictionary-part-of-speech',
    category: 'technical-words',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['part-of-speech', 'dependencies'] },
    docs: {
      description: 'Compare a known approved dictionary word with its parsed part of speech.',
    },
  },
  create(context) {
    const provider = configuredProvider(context.options, context.services.terminology);
    return {
      Sentence(sentence) {
        for (const token of sentence.dep.tokens) {
          const parsedPart = parsedPartOfSpeech(token);
          if (!parsedPart) continue;
          const approved = (provider?.lookup(token.form, { language: context.doc.language }) ?? [])
            .filter(({ record }) => record.status === 'approved');
          if (!approved.length
            || approved.some(({ record }) => record.partsOfSpeech?.includes(parsedPart))) continue;
          const permittedParts = approved.flatMap(({ record }) => record.partsOfSpeech ?? []);
          const permitted = [...new Set(permittedParts)].join(' or ');
          context.report({
            span: { start: token.start, end: token.end },
            message: `The parser reads “${token.form}” as ${parsedPart}, but the loaded dictionary approves it only as ${permitted}.`,
            suggestion: 'Confirm the intended grammatical role before changing the sentence.',
            evidence: [{
              kind: 'terminology-part-of-speech',
              span: { start: token.start, end: token.end },
              data: {
                provider: approved[0]!.providerId,
                parsed: parsedPart,
                permitted,
              },
            }],
            assumptions: ['The active parser assigned the grammatical role used for this comparison.'],
          });
        }
      },
    };
  },
});
