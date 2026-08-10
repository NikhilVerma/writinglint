import type { Category } from 'writinglint-core';

export const CATEGORIES: Record<string, Category> = {
  'technical-words': {
    id: 'technical-words',
    label: 'Words',
    blurb: 'Controlled spelling and word forms.',
    weight: 2,
  },
  'technical-sentences': {
    id: 'technical-sentences',
    label: 'Sentences',
    blurb: 'Sentence length, verb construction, and agency.',
    weight: 3,
  },
  'technical-paragraphs': {
    id: 'technical-paragraphs',
    label: 'Paragraphs',
    blurb: 'Paragraph size and organization.',
    weight: 2,
  },
  'technical-punctuation': {
    id: 'technical-punctuation',
    label: 'Punctuation',
    blurb: 'Punctuation permitted by the controlled language.',
    weight: 3,
  },
};
