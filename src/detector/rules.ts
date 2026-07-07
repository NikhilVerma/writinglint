/**
 * Lexical rules — the "signs of AI writing" that are irreducibly about specific
 * WORDS or CHARACTERS, and so are lists by nature (you cannot detect that
 * "delve" is over-used without the token "delve"):
 *
 *   - AI vocabulary (Wikipedia's own high-density word list)
 *   - formatting tells (em-dash spray, curly quotes, markdown, emoji)
 *   - a few fixed IDIOMS ("rich tapestry", "nestled in the heart of",
 *     "in today's world") that are multiword expressions, not constructions
 *   - sentence-opening transitions ("Moreover,", "In conclusion,")
 *
 * Everything that is a CONSTRUCTION (significance inflation via copula
 * avoidance, negative parallelism, triads, participial appendages, vague
 * attribution, throat-clearing) lives in structural.ts, matched on the
 * dependency graph — not here.
 */
import type { Category, Context, Finding, Rule } from './types.js';
import { CATEGORIES } from './types.js';
import {
  AI_VOCAB,
  META_PHRASES,
  OPENING_CONJUNCTIONS,
  PHRASE_NOTES,
  PROMO_PHRASES,
  SIGNIFICANCE_PHRASES,
} from './lexicons.js';

// ── helpers ────────────────────────────────────────────────────────────────

/** Fold curly quotes/apostrophes to straight, preserving length & offsets. */
export function normalize(text: string): string {
  return text.replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"');
}

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}])';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseBody(p: string): string {
  return escapeRe(normalize(p)).replace(/\s+/g, '\\s+').replace(/-/g, '[-\\s]');
}

function compilePhrases(phrases: string[]): RegExp {
  const sorted = [...new Set(phrases)].sort((a, b) => b.length - a.length);
  const alt = sorted.map(phraseBody).join('|');
  return new RegExp(`${BOUNDARY_BEFORE}(?:${alt})${BOUNDARY_AFTER}`, 'giu');
}

/** Generic idiom-lexicon rule: flag every fixed phrase hit. */
function lexiconRule(ruleName: string, phrases: string[], category: Category, fallback: string): Rule {
  const re = compilePhrases(phrases);
  return (ctx: Context): Finding[] => {
    const norm = normalize(ctx.text);
    const out: Finding[] = [];
    for (const m of norm.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      const key = m[0].toLowerCase().replace(/\s+/g, ' ');
      out.push({
        start,
        end,
        category,
        text: ctx.text.slice(start, end),
        message: PHRASE_NOTES[key] ?? fallback,
        rule: ruleName,
      });
    }
    return out;
  };
}

// ── idiom-lexicon rules (fixed multiword expressions) ─────────────────────────

const significanceIdioms = lexiconRule(
  'significance-idioms',
  SIGNIFICANCE_PHRASES,
  'significance',
  'Inflated significance. Say what happened; let readers judge its weight.',
);

const promoIdioms = lexiconRule(
  'promo-idioms',
  PROMO_PHRASES,
  'promo',
  'Promotional / marketing tone. Prefer plain, neutral phrasing.',
);

const metaIdioms = lexiconRule(
  'chatbot-idioms',
  META_PHRASES,
  'meta',
  'Editorialising / chatbot filler. Address the topic, not the reader.',
);

/** Single-word AI vocabulary — inherently lexical (a word-frequency signal). */
const aiVocabRule: Rule = (ctx) => {
  const set = new Set(AI_VOCAB.map((w) => w.toLowerCase()));
  const out: Finding[] = [];
  for (const t of ctx.tokens) {
    if (set.has(t.lower)) {
      out.push({
        start: t.start,
        end: t.end,
        category: 'ai-vocab',
        text: t.text,
        message: PHRASE_NOTES[t.lower] ?? 'Word LLMs over-use. Consider a plainer choice.',
        rule: 'ai-vocab',
      });
    }
  }
  return out;
};

/** Formulaic transitions, but only when they OPEN a sentence. */
const conjunctionRule: Rule = (ctx) => {
  const openers = OPENING_CONJUNCTIONS.map((c) => normalize(c).toLowerCase());
  const out: Finding[] = [];
  for (const s of ctx.sentences) {
    const norm = normalize(s.text);
    const head = norm.toLowerCase().replace(/^[\s"'([]+/, '');
    for (const c of openers) {
      if (head.startsWith(c) && /^[\s,.:;]/.test(head.slice(c.length) || ' ')) {
        const idx = norm.toLowerCase().indexOf(c);
        if (idx === -1) break;
        const start = s.start + idx;
        out.push({
          start,
          end: start + c.length,
          category: 'conjunctions',
          text: ctx.text.slice(start, start + c.length),
          message: PHRASE_NOTES[c] ?? 'Formulaic transition to open a sentence. Often removable.',
          rule: 'opening-conjunction',
        });
        break;
      }
    }
  }
  return out;
};

// ── formatting tells (character-level) ────────────────────────────────────────
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;

const formattingRule: Rule = (ctx) => {
  const text = ctx.text;
  const out: Finding[] = [];

  const emDashes = [...text.matchAll(/—/g)];
  const sentenceCount = Math.max(1, ctx.sentences.length);
  if (emDashes.length >= 3 && emDashes.length / sentenceCount > 0.4) {
    for (const m of emDashes)
      out.push({
        start: m.index,
        end: m.index + 1,
        category: 'formatting',
        text: '—',
        message: `Heavy em-dash use (${emDashes.length} in ${sentenceCount} sentences). LLMs over-reach for the em dash.`,
        rule: 'em-dash-overuse',
      });
  }

  const curly = [...text.matchAll(/[‘’“”]/g)];
  if (curly.length >= 4) {
    for (const m of curly)
      out.push({
        start: m.index,
        end: m.index + 1,
        category: 'formatting',
        text: text[m.index],
        message: 'Curly “smart” quote — common in chatbot output; editors often want straight quotes.',
        rule: 'curly-quotes',
      });
  }

  for (const m of text.matchAll(/\*\*[^\n*]+\*\*/g))
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      category: 'formatting',
      text: m[0],
      message: 'Markdown bold left in the text — a paste artifact from an LLM.',
      rule: 'markdown-bold',
    });

  for (const m of text.matchAll(/^#{1,6}\s+.+$/gm))
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      category: 'formatting',
      text: m[0],
      message: 'Markdown heading (“#”) in prose — a chatbot formatting artifact.',
      rule: 'markdown-heading',
    });

  for (const m of text.matchAll(EMOJI_RE))
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      category: 'formatting',
      text: m[0],
      message: 'Decorative emoji — a strong tell in encyclopedic / formal prose.',
      rule: 'emoji',
    });

  return out;
};

/** The lexical rules (structural rules are applied separately by the analyzer). */
export const RULES: Rule[] = [
  significanceIdioms,
  promoIdioms,
  metaIdioms,
  aiVocabRule,
  conjunctionRule,
  formattingRule,
];

export const CATEGORY_WEIGHT = (c: Category): number => CATEGORIES[c].weight;
