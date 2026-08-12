import type { Category } from 'writinglint-core';

export const CATEGORIES: Record<string, Category> = {
  load: {
    id: 'load',
    label: 'Reading load',
    blurb: 'Sentences and paragraphs that ask the reader to track too much at once.',
    weight: 3,
  },
  jargon: {
    id: 'jargon',
    label: 'Jargon',
    blurb: 'Terms and noun clusters that make readers reconstruct the meaning.',
    weight: 3,
  },
};
