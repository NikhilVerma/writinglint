/**
 * Shared machinery for the lexical rules — the "signs of AI writing" that are
 * irreducibly about specific WORDS or CHARACTERS (you cannot detect that "delve"
 * is over-used without the token "delve"). Constructions live in the structural
 * rules, matched on the dependency graph.
 */
import { defineRule, type Rule } from '@better-write/core';
import { PHRASE_NOTES } from '../lexicons.js';

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

export function compilePhrases(phrases: string[]): RegExp {
  const sorted = [...new Set(phrases)].sort((a, b) => b.length - a.length);
  const alt = sorted.map(phraseBody).join('|');
  return new RegExp(`${BOUNDARY_BEFORE}(?:${alt})${BOUNDARY_AFTER}`, 'giu');
}

/**
 * Build an idiom-lexicon rule: flag every fixed-phrase hit over the whole
 * document, with a per-phrase note where one exists (else a category fallback).
 */
export function makeLexiconRule(opts: {
  name: string;
  category: string;
  phrases: string[];
  description: string;
  fallback: string;
}): Rule {
  const re = compilePhrases(opts.phrases);
  return defineRule({
    meta: { name: opts.name, category: opts.category, docs: { description: opts.description } },
    create(ctx) {
      return {
        Document(doc) {
          const norm = normalize(doc.text);
          for (const m of norm.matchAll(re)) {
            const start = m.index;
            const end = start + m[0].length;
            const key = m[0].toLowerCase().replace(/\s+/g, ' ');
            ctx.report({ span: { start, end }, message: PHRASE_NOTES[key] ?? opts.fallback });
          }
        },
      };
    },
  });
}
