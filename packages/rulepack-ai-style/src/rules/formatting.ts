/**
 * Formatting tells (character-level) — split into independently-toggleable
 * rules so a user can disable e.g. `emoji` without losing the em-dash /
 * quote checks. All share the `formatting` category (the scorer counts by
 * category, so the split is score-neutral).
 *
 * Deliberately NOT flagged, because humans produce them constantly with no
 * AI involved:
 *  - Markdown syntax (`**bold**`, `#` headings) — the native authoring format
 *    for READMEs, docs, and notes apps.
 *  - Curly quotes on their own — Word, Google Docs, and iOS auto-curl typed
 *    quotes by default. Only MIXED straight+curly styles carry signal (a
 *    paste seam); see `mixed-quotes`.
 */
import { defineRule } from 'writinglint-core';

// Extended_Pictographic excludes ordinary technical arrows and mathematical
// symbols that broad Unicode "emoji" blocks incorrectly classify as decoration.
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?/gu;

const EM_DASH_WINDOW_SENTENCES = 8;
const LOCAL_EM_DASH_MINIMUM = 4;
const GLOBAL_EM_DASH_MINIMUM = 12;
const GLOBAL_EM_DASH_RATE = 1 / 12;

/**
 * Em-dash use graded by local clusters and whole-document habit. Local windows
 * prevent unrelated dash-free prose from diluting a conspicuous burst.
 */
export const emDashOveruse = defineRule({
  meta: {
    name: 'em-dash-overuse',
    category: 'formatting',
    docs: { description: 'Locally clustered or globally habitual em-dash use.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const emDashes = [...doc.text.matchAll(/—/g)];
        const sentenceCount = Math.max(1, doc.sentences.length);
        if (!emDashes.length) return;

        const dashesBySentence = doc.sentences.map((sentence) =>
          emDashes.filter((dash) => dash.index >= sentence.start && dash.index < sentence.end).length,
        );
        let densestWindow = { count: 0, size: 0 };
        for (let start = 0; start < dashesBySentence.length; start++) {
          const end = Math.min(start + EM_DASH_WINDOW_SENTENCES, dashesBySentence.length);
          const count = dashesBySentence.slice(start, end).reduce((sum, value) => sum + value, 0);
          if (count > densestWindow.count) densestWindow = { count, size: end - start };
        }

        const localCluster = densestWindow.count >= LOCAL_EM_DASH_MINIMUM;
        const globalHabit = emDashes.length >= GLOBAL_EM_DASH_MINIMUM
          && emDashes.length / sentenceCount >= GLOBAL_EM_DASH_RATE;
        const confidence = localCluster || globalHabit ? 'medium' : 'low';
        const first = emDashes[0]!;
        ctx.report({
          span: { start: first.index, end: first.index + 1 },
          confidence,
          message: localCluster
            ? `Em-dash cluster (${densestWindow.count} in ${densestWindow.size} consecutive sentences; `
              + `${emDashes.length} in ${sentenceCount} sentences overall). Review whether the repeated rhythm is doing useful work.`
            : globalHabit
              ? `Repeated em-dash habit (${emDashes.length} in ${sentenceCount} sentences). `
                + 'Review whether the repeated rhythm is doing useful work.'
              : `Em dash used here (${emDashes.length} in ${sentenceCount} sentences). Weak signal on its own; `
                + 'review whether a comma, colon, or full stop is plainer.',
        });
      },
    };
  },
});

/**
 * Mixed straight + curly DOUBLE quotes — the paste seam. An all-curly document
 * is normal (word processors auto-curl); an all-straight one is normal (plain
 * editors). Both styles in ONE document usually means a chunk was pasted in
 * from elsewhere — often a chatbot. Flags the minority style.
 *
 * Deliberately restricted to double quotes: straight apostrophes in
 * contractions ("don't") are ubiquitous in typed text and would make any
 * document quoting a curly source fire.
 */
export const mixedQuotes = defineRule({
  meta: {
    name: 'mixed-quotes',
    category: 'formatting',
    docs: { description: 'Straight and curly double quotes mixed in one document — a paste seam.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const curly = [...doc.text.matchAll(/[“”]/g)];
        const straight = [...doc.text.matchAll(/"/g)];
        if (curly.length < 2 || straight.length < 2) return;
        const minority = curly.length <= straight.length ? curly : straight;
        for (const m of minority)
          ctx.report({
            span: { start: m.index, end: m.index + 1 },
            message:
              'Straight and curly quotes are mixed — often a seam where pasted (chatbot) text meets typed text. Pick one style.',
          });
      },
    };
  },
});

/**
 * Leftover generation artifacts — citation tokens chatbots embed and users
 * fail to strip when copying out: `oaicite`/`contentReference` (ChatGPT),
 * `turn0search0`-style markers, `grok_card`, `utm_source=chatgpt.com` links,
 * and Unicode private-use delimiter characters. Near-zero false positives.
 */
const ARTIFACT_RE =
  /\boaicite\b|\boai_citation\b|\bcontentReference\b|\bturn\d+(?:search|news|view|file|fetch)\d+\b|\bgrok_card\b|\butm_source=chatgpt\.com\b|[-]/g;

export const generationArtifacts = defineRule({
  meta: {
    name: 'generation-artifacts',
    category: 'formatting',
    docs: { description: 'Leftover chatbot citation artifacts (oaicite, turn0search0, …).' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const m of doc.text.matchAll(ARTIFACT_RE))
          ctx.report({
            span: { start: m.index, end: m.index + m[0].length },
            message:
              'Leftover AI generation artifact — a citation token from chatbot output that should have been stripped.',
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
