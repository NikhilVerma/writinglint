/**
 * Comma splice / clipped parataxis — two complete clauses stapled with a bare
 * comma: "Thanks for the demo, I enjoyed it." Chatbots use the construction to
 * perform breeziness when clipped: two flat beats, no connective, no
 * subordination — warmth asserted by rhythm rather than content. Humans splice
 * too (informally), so a lone splice reports at low confidence. Length changes
 * the explanation, never whether the grammatical construction exists.
 *
 * The graph makes this expressible: the second clause hangs off the first as
 * `parataxis` with its own `nsubj` and no coordinator (`cc`) or subordinator
 * (`mark`) — exactly the "no connective" relation a regex cannot see.
 */
import { byId, childrenOf, defineRule, lower, subtree, type DepSentence } from 'writinglint-core';

/** Reporting verbs — "…, he said" in fiction/quotes is normal parataxis. */
const REPORTING = new Set([
  'said', 'says', 'say', 'replied', 'asked', 'answered', 'cried', 'thought',
  'whispered', 'shouted', 'added', 'continued', 'observed', 'remarked',
  'exclaimed', 'returned', 'wrote', 'muttered', 'repeated',
]);

/**
 * Comment-clause verbs — "…, you see, …", "…, I think" are epistemic
 * parentheticals (ordinary since long before LLMs), not splices.
 */
const COMMENT = new Set([
  'see', 'think', 'know', 'suppose', 'believe', 'guess', 'imagine', 'hope',
  'fear', 'mean', 'admit', 'confess', 'assure', 'reckon', 'gather', 'trust',
]);

const MAX_SENTENCE_WORDS = 18;
const MAX_CLAUSE_TOKENS = 9;

export const commaSplice = defineRule({
  meta: {
    name: 'comma-splice',
    category: 'rhythm',
    docs: { description: 'Two independent clauses joined only by a comma; clipped cases can perform breeziness.' },
  },
  create(ctx) {
    const matches: Array<{
      s: DepSentence;
      tokens: ReturnType<typeof subtree>;
      clipped: boolean;
    }> = [];
    return {
      Sentence(sentence) {
        // Dialogue and quoted speech splice legitimately; skip any sentence
        // carrying quotation marks (contractions stripped first).
        if (/["“”«»‘]|(?<!\w)’|’(?!\w)/.test(sentence.text)) return;
        if (sentence.words.length < 4) return;
        const s: DepSentence = sentence.dep;
        for (const t of s.tokens) {
          if (t.deprel !== 'parataxis') continue;
          if (t.upos !== 'VERB' && t.upos !== 'AUX' && t.upos !== 'ADJ') continue;
          if (REPORTING.has(lower(t))) continue;
          const kids = childrenOf(s, t.id);
          if (!kids.some((c) => c.deprel === 'nsubj' || c.deprel.startsWith('nsubj:'))) continue;
          if (kids.some((c) => c.deprel === 'cc' || c.deprel === 'mark')) continue;
          const clause = subtree(s, t.id);
          // Compact parsers sometimes label coordinating “so” as an adverb on
          // a parataxis root. It is still an explicit connective, so this is
          // not the bare-clause boundary the rule is looking for.
          if (clause.some((token) => lower(token) === 'so' && token.id < t.id)) continue;
          // "…, I believe, …" — an epistemic parenthetical whatever the parser
          // decided to pull into its subtree.
          const commentSubj = kids.find((c) => c.deprel === 'nsubj' && c.upos === 'PRON');
          if (COMMENT.has(lower(t)) && commentSubj) continue;
          // The splice itself: a bare comma on the clause boundary (the parser
          // may attach it to either clause, so check both sides).
          const first = clause.reduce((min, c) => Math.min(min, c.id), t.id);
          if (byId(s, first)?.form !== ',' && byId(s, first - 1)?.form !== ',') continue;
          // ",— the whale now reigneth" (archaic comma-dash) and clefts
          // ("It is the spectator, that art really mirrors") are not splices.
          const clauseStart = [...clause].sort((a, b) => a.id - b.id).map((c) => lower(c)).find((f) => f !== ',');
          const afterComma = byId(s, first)?.form === ',' ? byId(s, first + 1) : byId(s, first);
          if (afterComma && /^[—–-]$/.test(afterComma.form)) continue;
          if (clauseStart === 'that' || clauseStart === 'which' || clauseStart === 'who'
            || (afterComma && ['that', 'which', 'who'].includes(lower(afterComma)))) continue;
          // A true splice runs to the end of the sentence; a clause that stops
          // mid-sentence is a parenthetical aside, not a second main clause.
          const last = clause.reduce((max, c) => Math.max(max, c.id), t.id);
          const lastContent = s.tokens.filter((c) => c.upos !== 'PUNCT').at(-1);
          if (lastContent && last < lastContent.id) continue;
          matches.push({
            s,
            tokens: clause,
            clipped: sentence.words.length <= MAX_SENTENCE_WORDS && clause.length <= MAX_CLAUSE_TOKENS,
          });
        }
      },
      DocumentExit() {
        const confidence = matches.length >= 2 ? 'medium' : 'low';
        for (const m of matches) ctx.report({
          tokens: m.tokens,
          sentence: m.s,
          confidence,
          message: m.clipped
            ? 'Comma splice: two complete clauses stapled with a bare comma — clipped parataxis that performs '
              + 'breeziness. Subordinate one clause, or use a conjunction, semicolon, dash, or full stop.'
            : 'Comma splice: two independent clauses are joined only by a comma. Subordinate one clause, '
              + 'or use a conjunction, semicolon, dash, or full stop.',
        });
      },
    };
  },
});
