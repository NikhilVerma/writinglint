/**
 * The categories the ai-style rules group under. These ids are also the keys the
 * stylometric scorer's category-rate features (c_*) count by, and the keys the
 * web UI colours highlights with — so they are stable identifiers, not just
 * labels. Display order is the array order in `CATEGORY_ORDER`.
 */
import type { Category } from 'writinglint-core';

export const CATEGORIES: Record<string, Category> = {
  evidence: {
    id: 'evidence',
    label: 'Combined evidence',
    blurb: 'Several weak signals become persuasive when they cluster across a paragraph or document.',
    weight: 4,
  },
  significance: {
    id: 'significance',
    label: 'Inflated significance',
    blurb: 'Grand claims about importance, legacy, or “broader trends”.',
    weight: 3,
  },
  parallelism: {
    id: 'parallelism',
    label: 'Negative parallelism',
    blurb: '“Not only… but also”, “It’s not X, it’s Y”, “X, not Y”.',
    weight: 3,
  },
  promo: {
    id: 'promo',
    label: 'Promotional puffery',
    blurb: 'Travel-brochure / press-release language and marketing verbs.',
    weight: 2.5,
  },
  vague: {
    id: 'vague',
    label: 'Vague attribution',
    blurb: 'Unnamed “experts”, “studies”, and “observers”.',
    weight: 2.5,
  },
  meta: {
    id: 'meta',
    label: 'Chatbot voice',
    blurb: 'Editorialising asides and reader-collaboration filler.',
    weight: 2,
  },
  agency: {
    id: 'agency',
    label: 'Hidden or false agency',
    blurb: 'Passive actor hiding and abstractions made to act like people.',
    weight: 2,
  },
  'ai-vocab': {
    id: 'ai-vocab',
    label: 'AI vocabulary',
    blurb: 'Words LLMs reach for far more often than people do.',
    weight: 2,
  },
  balance: {
    id: 'balance',
    label: 'Hedging seesaw',
    blurb: 'Relentless “While X… However, Y” — a position never taken.',
    weight: 2,
  },
  'rule-of-three': {
    id: 'rule-of-three',
    label: 'Rule of three',
    blurb: 'Reflexive triads of adjectives or phrases.',
    weight: 1.5,
  },
  conjunctions: {
    id: 'conjunctions',
    label: 'Formulaic transitions',
    blurb: 'Sentence-opening “Moreover,”, “Furthermore,”, “In conclusion,”.',
    weight: 1.5,
  },
  formatting: {
    id: 'formatting',
    label: 'Formatting tells',
    blurb: 'Em-dash spray, mixed quote styles, emoji, leftover chatbot artifacts.',
    weight: 1,
  },
  rhythm: {
    id: 'rhythm',
    label: 'Uniform rhythm',
    blurb: 'Sentence lengths and openings fall into a machine-like cadence.',
    weight: 1.5,
  },
};

/** Display / overlap-priority order (earlier = higher priority when marks collide). */
export const CATEGORY_ORDER: string[] = [
  'evidence',
  'significance',
  'parallelism',
  'promo',
  'vague',
  'meta',
  'ai-vocab',
  'agency',
  'balance',
  'rule-of-three',
  'conjunctions',
  'formatting',
  'rhythm',
];

export const CATEGORY_WEIGHT = (c: string): number => CATEGORIES[c]?.weight ?? 1;
