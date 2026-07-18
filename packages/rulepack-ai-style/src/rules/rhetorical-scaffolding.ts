import { defineRule } from 'writinglint-core';

const SCAFFOLD_RE = /\b(?:here(?:'|’)s (?:what i mean|the thing|how it works|why|the bit|where it gets [a-z]+)|what if i told you|think about it|let that sink in|and that(?:'|’)s okay|the uncomfortable truth is|the idea is simple|let me walk you through|so picture this|quick refresher|the reflex objection|the answer is|the key trick|the key fact|the key is)\b/gi;

export const rhetoricalScaffolding = defineRule({
  meta: {
    name: 'rhetorical-scaffolding',
    category: 'meta',
    docs: { description: 'Announces, dramatizes, or reassures around a point instead of stating it.' },
  },
  create(ctx) {
    return {
      Document(doc) {
        const matches = [...doc.text.matchAll(SCAFFOLD_RE)];
        const confidence = matches.length >= 3 ? 'medium' : 'low';
        for (const match of matches) {
          ctx.report({
            span: { start: match.index, end: match.index + match[0].length },
            confidence,
            message: matches.length >= 3
              ? `Repeated rhetorical scaffolding (${matches.length} instances) keeps announcing points instead of making them. Cut the setups.`
              : 'Possible rhetorical scaffolding: this announces the point instead of making it. Cut the setup if the next sentence works alone.',
          });
        }
      },
    };
  },
});
