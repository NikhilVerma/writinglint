import { defineRule } from 'writinglint-core';

const CONTRACTION = /\b(?:ain['’]t|aren['’]t|can['’]t|couldn['’]t|didn['’]t|doesn['’]t|don['’]t|hadn['’]t|hasn['’]t|haven['’]t|isn['’]t|mightn['’]t|mustn['’]t|needn['’]t|shan['’]t|shouldn['’]t|wasn['’]t|weren['’]t|won['’]t|wouldn['’]t|(?:he|here|how|it|let|she|that|there|what|when|where|who|why)['’]s|[A-Za-z]+(?:['’]d|['’]ll|['’]m|['’]re|['’]ve))\b/giu;

export const noContractions = defineRule({
  meta: {
    name: 'no-contractions',
    category: 'technical-words',
    defaultSeverity: 'error',
    defaultConfidence: 'high',
    requires: { parser: ['part-of-speech', 'dependencies'] },
    docs: {
      description: 'Do not omit words or use contractions (ASD-STE100 Issue 9, rule 4.2).',
    },
  },
  create(context) {
    return {
      Document(document) {
        for (const match of document.text.matchAll(CONTRACTION)) {
          const start = match.index;
          context.report({
            span: { start, end: start + match[0].length },
            message: `Write “${match[0]}” in full. Technical English does not use contractions.`,
          });
        }
      },
      Sentence(sentence) {
        const tokens = sentence.dep.tokens;
        for (let index = 1; index < tokens.length - 1; index += 1) {
          const marker = tokens[index]!;
          const subject = tokens[index - 1]!;
          const predicate = tokens[index + 1]!;
          if (!/^['’]s$/u.test(marker.form)
            || marker.upos !== 'PUNCT'
            || subject.deprel !== 'nsubj'
            || predicate.upos !== 'VERB'
            || subject.end !== marker.start) continue;
          const text = context.doc.text.slice(subject.start, marker.end);
          context.report({
            span: { start: subject.start, end: marker.end },
            message: `Write “${text}” in full. In this sentence, the apostrophe form contracts a subject with “is” or “has”.`,
          });
        }
      },
    };
  },
});
