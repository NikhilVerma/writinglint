import { defineRule } from 'writinglint-core';

const VAGUE_DECLARATIVE_RE = /\b(?:the (?:key|beauty|reality|truth|lesson|implications?|important (?:part|point|thing)|difference) (?:is|are)|(?:this|that|these) (?:approach|method|strategy|shift|evolution|framework|system|process|pattern|idea) (?:is|are|can|will|allows?|enables?|ensures?|provides?|offers?|demonstrates?|highlights?|underscores?|reflects?))\b/gi;

/** Abstract announcements and demonstratives that can hide the concrete claim. */
export const vagueDeclarative = defineRule({
  meta: {
    name: 'vague-declarative',
    category: 'vague',
    docs: { description: 'An abstract announcement or vague “this approach…” claim that may need a concrete subject.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const matches = [...doc.text.matchAll(VAGUE_DECLARATIVE_RE)];
        const confidence = matches.length >= 3 ? 'medium' : 'low';
        for (const match of matches) {
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: matches.length >= 3
              ? `Repeated vague declaratives (${matches.length} instances) keep announcing abstractions. Name the mechanism or consequence directly.`
              : 'Possible vague declarative. Replace the abstract setup with the specific mechanism, actor, or consequence.',
          });
        }
      },
    };
  },
});
