import { byId, childrenOf, defineRule, lower, root, type Sentence } from 'writinglint-core';
import type { DepToken } from 'writinglint-core';

interface Occurrence {
  sentence: Sentence;
  token: DepToken;
}

const normalizeNoun = (token: DepToken): string => {
  const word = lower(token).replace(/[’']s$/, '');
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
};

function introducedIndefinitely({ sentence, token }: Occurrence): boolean {
  return childrenOf(sentence.dep, token.id).some((child) =>
    child.deprel === 'det' && /^(?:a|an)$/.test(lower(child)));
}

function definesTerm({ sentence, token }: Occurrence, term: string): boolean {
  const children = childrenOf(sentence.dep, token.id);
  if (children.some((child) => child.deprel === 'appos')) return true;
  // A relative clause only defines the term when it is attached to the
  // indefinite introduction itself. Compact parsers sometimes attach a later
  // parenthetical such as “rules (that's cheating)” as `acl:relcl`.
  if (introducedIndefinitely({ sentence, token }) && children.some((child) =>
    child.deprel === 'acl' || child.deprel.startsWith('acl:'))) return true;
  const predicate = root(sentence.dep);
  if (predicate && token.deprel.startsWith('nsubj')
      && childrenOf(sentence.dep, predicate.id).some((child) => child.deprel === 'cop')) return true;
  const head = byId(sentence.dep, token.head);
  if (head && /^(?:call|called|define|defined|mean|means|refer|refers)$/.test(lower(head))) return true;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:define|defined|means?|refers? to)\\s+(?:the\\s+)?${escaped}\\b|\\b${escaped}\\s+(?:means|refers to)\\b`, 'i')
    .test(sentence.text);
}

/** A repeated, question-bearing term introduced as if the reader already knows it. */
export const undefinedKeyTerm = defineRule({
  meta: {
    name: 'undefined-key-term',
    category: 'vague',
    docs: {
      description: 'A central term is introduced indefinitely, repeated across the document, and asked about without being defined.',
    },
  },
  create(ctx) {
    return {
      Document(doc) {
        const occurrences = new Map<string, Occurrence[]>();
        for (const sentence of doc.sentences) {
          for (const token of sentence.dep.tokens) {
            if (token.upos !== 'NOUN') continue;
            const term = normalizeNoun(token);
            const group = occurrences.get(term);
            const occurrence = { sentence, token };
            if (group) group.push(occurrence);
            else occurrences.set(term, [occurrence]);
          }
        }

        for (const [term, group] of occurrences) {
          if (group.length < 3 || !introducedIndefinitely(group[0]!)) continue;
          const paragraphCount = new Set(group.map(({ sentence }) =>
            doc.paragraphs.find((paragraph) =>
              sentence.start >= paragraph.start && sentence.end <= paragraph.end)?.index)).size;
          if (paragraphCount < 2) continue;
          if (!group.some(({ sentence }) => sentence.text.includes('?'))) continue;
          if (group.some((occurrence) => definesTerm(occurrence, term))) continue;
          const first = group[0]!.token;
          ctx.report({
            span: { start: first.start, end: first.end },
            confidence: 'low',
            message: `Possible undefined key term: “${first.form}” becomes a recurring question without a definition, example, or stated relationship. Define it when it first appears.`,
          });
        }
      },
    };
  },
});
