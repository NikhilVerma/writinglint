import { defineRule, type Paragraph, type Sentence } from 'writinglint-core';

const STOP = new Set('a an and are as at be been but by can could did do does for from had has have he her here him his how i if in into is it its just may might more most my no not of on one only or our out she should so than that the their them there these they this those to too up us was we were what when where which who why will with would you your'.split(' '));
const SUPPORT_RE = /\b(?:according to|appendix|benchmark|case study|dataset|experiment|figure|for example|for instance|log|logs|measured|measurement|sample|source|study|survey|table|test|trial)\b|https?:\/\/|\[\^?\d+\]/i;
const MECHANISM_RE = /\b(?:because|so that|thereby|which (?:means|shows)|by [a-z]+ing)\b/i;
const NEGATION_RE = /\b(?:no|not|never)\b|\bn\s*['’]\s*t\b/i;

function stem(word: string): string {
  const normalized = word.replace(/'(?:s|re|ve|ll|d|m)$/i, '');
  if (normalized.length > 6 && normalized.endsWith('ing')) return normalized.slice(0, -3);
  if (normalized.length > 5 && normalized.endsWith('ed')) return normalized.slice(0, -2);
  if (normalized.length > 5 && normalized.endsWith('es')) return normalized.slice(0, -2);
  if (normalized.length > 4 && normalized.endsWith('s')) return normalized.slice(0, -1);
  return normalized;
}

function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
    .map(stem)
    .filter((word) => !STOP.has(word)));
}

function hasTextSupport(text: string, sentences: Sentence[]): boolean {
  if (SUPPORT_RE.test(text)) return true;
  return sentences.some((sentence) =>
    sentence.dep.tokens.some((token) => token.upos === 'NUM' || /\d/.test(token.form)));
}

function addsConcreteSupport(paragraph: Paragraph): boolean {
  return hasTextSupport(paragraph.text, paragraph.sentences);
}

function isProceduralList(paragraph: Paragraph): boolean {
  const nonempty = paragraph.text.split(/\r?\n/).filter((line) => line.trim());
  if (nonempty.length < 3) return false;
  const steps = nonempty.filter((line) => /^\s*(?:[-*+] |\d+[.)] )/.test(line)).length;
  return steps / nonempty.length >= 0.6;
}

/** Nearby sentences or paragraphs that restate substantially the same content. */
export const semanticRedundancy = defineRule({
  meta: {
    name: 'semantic-redundancy',
    category: 'meta',
    docs: { description: 'A nearby sentence or paragraph repeats the same argument without adding concrete support.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        for (const paragraph of doc.paragraphs) {
          if (paragraph.sentences.length < 3 || isProceduralList(paragraph)) continue;
          const sentenceWords = paragraph.sentences.map((sentence) => contentWords(sentence.text));
          for (let current = 2; current < paragraph.sentences.length; current++) {
            const right = sentenceWords[current]!;
            if (right.size < 5) continue;
            let best = { similarity: 0, novel: Infinity, previous: -1 };
            for (let previous = Math.max(0, current - 4); previous <= current - 2; previous++) {
              const left = sentenceWords[previous]!;
              if (left.size < 5) continue;
              const shared = [...right].filter((word) => left.has(word)).length;
              const novel = [...right].filter((word) => !left.has(word)).length;
              const containment = shared / Math.min(left.size, right.size);
              if (shared >= 5 && containment > best.similarity) {
                best = { similarity: containment, novel, previous };
              }
            }
            if (best.previous === -1 || best.similarity < 0.6) continue;
            const sentence = paragraph.sentences[current]!;
            const previousSentence = paragraph.sentences[best.previous]!;
            if (NEGATION_RE.test(sentence.text) !== NEGATION_RE.test(previousSentence.text)) continue;
            if (hasTextSupport(sentence.text, [sentence])) continue;
            if (MECHANISM_RE.test(sentence.text) && best.novel >= 4) continue;
            ctx.report({
              span: { start: sentence.start, end: sentence.end },
              confidence: best.similarity >= 0.68 && best.novel <= 3 ? 'medium' : 'low',
              message: `Possible semantic repetition: this sentence repeats ${Math.round(best.similarity * 100)}% of an earlier sentence's concrete vocabulary but adds no measurement, source, example, or mechanism.`,
            });
          }
        }

        const words = doc.paragraphs.map((paragraph) => contentWords(paragraph.text));
        for (let current = 1; current < doc.paragraphs.length; current++) {
          const right = words[current]!;
          if (right.size < 6) continue;
          let best = { similarity: 0, novel: Infinity, previous: -1 };
          for (let previous = Math.max(0, current - 4); previous < current; previous++) {
            const left = words[previous]!;
            if (left.size < 6) continue;
            const shared = [...right].filter((word) => left.has(word)).length;
            const novel = [...right].filter((word) => !left.has(word)).length;
            const containment = shared / Math.min(left.size, right.size);
            if (shared >= 5 && containment > best.similarity) {
              best = { similarity: containment, novel, previous };
            }
          }
          if (best.previous === -1 || best.similarity < 0.48) continue;
          const paragraph = doc.paragraphs[current]!;
          const procedural = isProceduralList(paragraph) && isProceduralList(doc.paragraphs[best.previous]!);
          if (NEGATION_RE.test(paragraph.text) !== NEGATION_RE.test(doc.paragraphs[best.previous]!.text)) continue;
          if (addsConcreteSupport(paragraph) && !procedural) continue;
          if (MECHANISM_RE.test(paragraph.text) && best.novel >= 4 && !procedural) continue;
          ctx.report({
            span: { start: paragraph.start, end: paragraph.end },
            // Adjacent recipes and checklists intentionally reuse their action
            // vocabulary. Keep the candidate, but do not call that repetition
            // persuasive without a semantic model.
            confidence: best.similarity >= 0.68 && !procedural ? 'medium' : 'low',
            message: `Possible semantic repetition: this paragraph shares ${Math.round(best.similarity * 100)}% of its concrete vocabulary with a nearby paragraph but adds no measurement, source, example, or mechanism.`,
          });
        }
      },
    };
  },
});
