import { defineRule } from 'writinglint-core';

const INITIALISM_RE = /\b[A-Z][A-Z0-9-]{2,9}\b/g;
const EXEMPT = new Set(['AI', 'API', 'CSS', 'HTML', 'HTTP', 'HTTPS', 'ID', 'IDs', 'JSON', 'SQL', 'UI', 'URL', 'URLs', 'UX']);

function isDefined(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:[A-Za-z][A-Za-z -]{3,80})\\s*\\(${escaped}\\)|${escaped}\\s*\\([A-Za-z][A-Za-z -]{3,80}\\)`).test(text);
}

/** A repeated initialism that the document never introduces in plain language. */
export const unexplainedInitialism = defineRule({
  meta: {
    name: 'unexplained-initialism',
    category: 'jargon',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries'] },
    docs: {
      description: 'A repeated initialism appears without a plain-language introduction.',
    },
  },
  create(context) {
    return {
      Document(document) {
        const occurrences = new Map<string, Array<{ start: number; end: number }>>();
        for (const match of document.text.matchAll(INITIALISM_RE)) {
          const term = match[0];
          if (EXEMPT.has(term) || isDefined(document.text, term)) continue;
          const group = occurrences.get(term) ?? [];
          group.push({ start: match.index, end: match.index + term.length });
          occurrences.set(term, group);
        }
        for (const [term, group] of occurrences) {
          if (group.length < 2) continue;
          const first = group[0]!;
          context.report({
            span: first,
            message: `“${term}” appears ${group.length} times without an introduction. Give its plain-language name at the first use.`,
            evidence: group.map((span) => ({ kind: 'initialism-use', span, data: { term } })),
          });
        }
      },
    };
  },
});
