/**
 * Core data model for the AI-writing style detector.
 *
 * The detector is deliberately framed as a *style linter*, not a probabilistic
 * "AI detector". Every finding points at a concrete stylistic tell drawn from
 * Wikipedia's "Signs of AI writing" — the kind of thing an editor would flag —
 * with a plain-language reason and, where possible, a suggested fix.
 */

/** The nine highlight categories the UI colours independently. */
export type Category =
  | 'ai-vocab' // AI-favoured single words (delve, tapestry, meticulous…)
  | 'significance' // Inflated significance / editorial grandstanding
  | 'promo' // Promotional puffery (nestled, boasts, renowned…)
  | 'parallelism' // Negative parallelisms ("not only… but also…")
  | 'rule-of-three' // Triads of adjectives / phrases
  | 'vague' // Vague attribution & weasel wording
  | 'conjunctions' // Formulaic transitions (Moreover, In conclusion…)
  | 'meta' // Editorialising meta / chatbot voice (It's worth noting…)
  | 'formatting'; // Formatting tells (em-dash spray, curly quotes, markdown…)

export interface CategoryInfo {
  id: Category;
  label: string;
  /** One-line description shown in the legend / tooltips. */
  blurb: string;
  /** Rough severity weight used in the aggregate score. */
  weight: number;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  significance: {
    id: 'significance',
    label: 'Inflated significance',
    blurb: 'Grand claims about importance, legacy, or “broader trends”.',
    weight: 3,
  },
  promo: {
    id: 'promo',
    label: 'Promotional puffery',
    blurb: 'Travel-brochure / press-release language and marketing verbs.',
    weight: 2.5,
  },
  parallelism: {
    id: 'parallelism',
    label: 'Negative parallelism',
    blurb: '“Not only… but also”, “It’s not X, it’s Y” constructions.',
    weight: 3,
  },
  'ai-vocab': {
    id: 'ai-vocab',
    label: 'AI vocabulary',
    blurb: 'Words LLMs reach for far more often than people do.',
    weight: 2,
  },
  vague: {
    id: 'vague',
    label: 'Vague attribution',
    blurb: 'Unnamed “experts”, “studies”, and “observers”.',
    weight: 2.5,
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
  meta: {
    id: 'meta',
    label: 'Chatbot voice',
    blurb: 'Editorialising asides and reader-collaboration filler.',
    weight: 2,
  },
  formatting: {
    id: 'formatting',
    label: 'Formatting tells',
    blurb: 'Em-dash spray, curly quotes, stray markdown, emoji.',
    weight: 1,
  },
};

/** Display order (also the priority order when highlights overlap). */
export const CATEGORY_ORDER: Category[] = [
  'significance',
  'parallelism',
  'promo',
  'vague',
  'meta',
  'ai-vocab',
  'rule-of-three',
  'conjunctions',
  'formatting',
];

/** A single flagged span in the source text. */
export interface Finding {
  /** Char offset into the original text (inclusive). */
  start: number;
  /** Char offset into the original text (exclusive). */
  end: number;
  category: Category;
  /** The exact substring that was flagged. */
  text: string;
  /** Why it was flagged, in plain language. */
  message: string;
  /** Optional concrete suggestion. */
  suggestion?: string;
  /** Which rule produced it (for debugging / dedup). */
  rule: string;
}

export interface Stats {
  words: number;
  sentences: number;
  characters: number;
  /** Findings per 100 words. */
  density: number;
  /** 0–100 aggregate "AI-style" score (higher = more tells). */
  score: number;
  /** Human-readable verdict band. */
  verdict: string;
}

export interface Analysis {
  findings: Finding[];
  /** Count of findings per category. */
  counts: Record<Category, number>;
  stats: Stats;
}

/** A word token with GLOBAL offsets into the original text (for lexical rules). */
export interface Tok {
  text: string;
  /** lower-cased text, for matching. */
  lower: string;
  /** Universal POS tag from the parse ('NOUN', 'VERB', 'PUNCT', …). */
  upos: string;
  start: number;
  end: number;
  sentence: number;
}

/** A sentence: its global char anchor, its dependency graph, and word tokens. */
export interface Sentence {
  text: string;
  start: number;
  end: number;
  /** Dependency graph for structural rules (from nlpgraph's parser). */
  dep: import('./graph.js').DepSentence;
  /** Non-punctuation tokens with global char offsets (for lexical rules). */
  words: Tok[];
}

/** Everything a rule needs to run. Assembled once per analysis from the parse. */
export interface Context {
  text: string;
  sentences: Sentence[];
  /** Flat word-token stream across the whole document (lexical convenience). */
  tokens: Tok[];
}

/** A lexical rule is a pure function from context to findings. */
export type Rule = (ctx: Context) => Finding[];
