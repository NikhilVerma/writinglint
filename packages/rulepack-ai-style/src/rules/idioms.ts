/**
 * Fixed multiword idioms — "rich tapestry", "nestled in the heart of", "in
 * today's world". Multiword EXPRESSIONS, not constructions, so they are lists by
 * nature. Three rules over three lexicons (significance / promo / chatbot).
 */
import { SIGNIFICANCE_PHRASES, PROMO_PHRASES, META_PHRASES } from '../lexicons.js';
import { makeLexiconRule } from './_lexicon.js';

export const significanceIdioms = makeLexiconRule({
  name: 'significance-idioms',
  category: 'significance',
  phrases: SIGNIFICANCE_PHRASES,
  description: 'Fixed “inflated significance” idioms (rich tapestry, testament to …).',
  fallback: 'Inflated significance. Say what happened; let readers judge its weight.',
});

export const promoIdioms = makeLexiconRule({
  name: 'promo-idioms',
  category: 'promo',
  phrases: PROMO_PHRASES,
  description: 'Travel-brochure / press-release idioms (nestled in the heart of …).',
  fallback: 'Promotional / marketing tone. Prefer plain, neutral phrasing.',
});

export const chatbotIdioms = makeLexiconRule({
  name: 'chatbot-idioms',
  category: 'meta',
  phrases: META_PHRASES,
  description: 'Editorialising / chatbot filler idioms (it’s worth noting …).',
  fallback: 'Editorialising / chatbot filler. Address the topic, not the reader.',
});
