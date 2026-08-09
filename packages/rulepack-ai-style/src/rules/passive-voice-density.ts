import { childrenOf, defineRule, type Sentence } from 'writinglint-core';

const WINDOW_SIZE = 6;
const MIN_WINDOW_SENTENCES = 4;
const MIN_PASSIVE_SENTENCES = 3;

function passiveClauseCount(sentence: Sentence): number {
  let count = 0;
  for (const token of sentence.dep.tokens) {
    if (token.upos !== 'VERB') continue;
    if (childrenOf(sentence.dep, token.id).some((child) => child.deprel === 'aux:pass')) count++;
  }
  return count;
}

function structuredBlock(text: string): boolean {
  if (text.includes('\u2029')) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const structured = lines.filter((line) => /^(?:[-*+]\s+|\d+[.)]\s+|\|)/.test(line)).length;
  return structured / lines.length >= 0.75;
}

/** A local run of passive clauses that turns an explanation into process narration. */
export const passiveVoiceDensity = defineRule({
  meta: {
    name: 'passive-voice-density',
    category: 'agency',
    docs: {
      description: 'Several nearby sentences rely on passive voice, making the process harder to follow.',
    },
  },
  create(ctx) {
    return {
      Document(doc) {
        const excluded = new Set(doc.paragraphs.filter((paragraph) => structuredBlock(paragraph.text)).map((paragraph) => paragraph.index));
        const sentences = doc.sentences.filter((sentence) => {
          const paragraph = doc.paragraphs.find((item) => sentence.start >= item.start && sentence.end <= item.end);
          return !paragraph || !excluded.has(paragraph.index);
        });
        const counts = sentences.map(passiveClauseCount);
        let best: { start: number; end: number; clauses: number; sentences: number; passiveSentences: number } | undefined;

        for (let start = 0; start < sentences.length; start++) {
          const end = Math.min(start + WINDOW_SIZE, sentences.length);
          const windowSentences = end - start;
          if (windowSentences < MIN_WINDOW_SENTENCES) continue;
          const slice = counts.slice(start, end);
          const clauses = slice.reduce((sum, count) => sum + count, 0);
          const passiveSentences = slice.filter((count) => count > 0).length;
          if (passiveSentences < MIN_PASSIVE_SENTENCES || passiveSentences / windowSentences < 0.5) continue;
          if (!best || clauses > best.clauses || (clauses === best.clauses && windowSentences < best.sentences)) {
            best = {
              start,
              end,
              clauses,
              sentences: windowSentences,
              passiveSentences,
            };
          }
        }

        if (!best) {
          const clauses = counts.reduce((sum, count) => sum + count, 0);
          const passiveSentences = counts.filter((count) => count > 0).length;
          if (passiveSentences < 4 || passiveSentences / Math.max(sentences.length, 1) < 0.3) return;
          best = {
            start: 0,
            end: sentences.length,
            clauses,
            sentences: sentences.length,
            passiveSentences,
          };
        }

        const first = sentences[best.start];
        const last = sentences[best.end - 1];
        if (!first || !last) return;
        ctx.report({
          span: { start: first.start, end: last.end },
          confidence: 'medium',
          message: `${best.passiveSentences} of ${best.sentences} nearby sentences use passive voice (${best.clauses} passive clauses). `
            + 'The repeated construction makes the process harder to follow. Name what the code, component, or person does where that actor matters.',
        });
      },
    };
  },
});
