/**
 * Formatting tells (character-level) — split into five independently-toggleable
 * rules so a user linting Markdown can disable just `markdown-bold` / `emoji`
 * without losing the em-dash / curly-quote checks. All share the `formatting`
 * category (the scorer counts by category, so the split is score-neutral).
 */
import { defineRule } from '@writinglint/core';

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;

/** Em-dash spray — flagged only past a per-sentence density (an LLM tell in bulk). */
export const emDashOveruse = defineRule({
  meta: {
    name: 'em-dash-overuse',
    category: 'formatting',
    docs: { description: 'Heavy em-dash use relative to sentence count.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const emDashes = [...doc.text.matchAll(/—/g)];
        const sentenceCount = Math.max(1, doc.sentences.length);
        if (emDashes.length >= 3 && emDashes.length / sentenceCount > 0.4) {
          for (const m of emDashes)
            ctx.report({
              span: { start: m.index, end: m.index + 1 },
              message: `Heavy em-dash use (${emDashes.length} in ${sentenceCount} sentences). LLMs over-reach for the em dash.`,
            });
        }
      },
    };
  },
});

/** Curly “smart” quotes — common in chatbot paste; editors often want straight. */
export const curlyQuotes = defineRule({
  meta: {
    name: 'curly-quotes',
    category: 'formatting',
    docs: { description: 'Curly “smart” quotes, common in chatbot output.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const curly = [...doc.text.matchAll(/[‘’“”]/g)];
        if (curly.length >= 4) {
          for (const m of curly)
            ctx.report({
              span: { start: m.index, end: m.index + 1 },
              message:
                'Curly “smart” quote — common in chatbot output; editors often want straight quotes.',
            });
        }
      },
    };
  },
});

/** Markdown bold left in prose — a paste artifact. */
export const markdownBold = defineRule({
  meta: {
    name: 'markdown-bold',
    category: 'formatting',
    docs: { description: 'Markdown **bold** left in the text.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const m of doc.text.matchAll(/\*\*[^\n*]+\*\*/g))
          ctx.report({
            span: { start: m.index, end: m.index + m[0].length },
            message: 'Markdown bold left in the text — a paste artifact from an LLM.',
          });
      },
    };
  },
});

/** Markdown heading (“#”) in prose — a chatbot formatting artifact. */
export const markdownHeading = defineRule({
  meta: {
    name: 'markdown-heading',
    category: 'formatting',
    docs: { description: 'Markdown headings (“#”) in prose.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const m of doc.text.matchAll(/^#{1,6}\s+.+$/gm))
          ctx.report({
            span: { start: m.index, end: m.index + m[0].length },
            message: 'Markdown heading (“#”) in prose — a chatbot formatting artifact.',
          });
      },
    };
  },
});

/** Decorative emoji — a strong tell in encyclopedic / formal prose. */
export const emoji = defineRule({
  meta: {
    name: 'emoji',
    category: 'formatting',
    docs: { description: 'Decorative emoji in formal prose.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const m of doc.text.matchAll(EMOJI_RE))
          ctx.report({
            span: { start: m.index, end: m.index + m[0].length },
            message: 'Decorative emoji — a strong tell in encyclopedic / formal prose.',
          });
      },
    };
  },
});
