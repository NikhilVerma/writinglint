import { childrenOf, defineRule, root as rootOf } from 'writinglint-core';

const IRREGULAR_PARTICIPLES = new Set(['built', 'chosen', 'done', 'given', 'kept', 'made', 'put', 'run', 'set', 'shown']);
const STRONG_RATIONALE_RE = /\b(?:deliberately|intentionally|on purpose|because|so that|in order to)\b/i;
const COMMAND_VERBS = new Set(['add', 'call', 'check', 'choose', 'create', 'delete', 'make', 'open', 'pass', 'read', 'remove', 'return', 'run', 'set', 'update', 'use', 'write']);

interface Candidate {
  start: number;
  end: number;
  sentence: number;
  strong: boolean;
}

/** Subjectless verb-led explanations that accumulate into implementation-trace cadence. */
export const agentlessRationale = defineRule({
  meta: {
    name: 'agentless-rationale',
    category: 'agency',
    docs: {
      description: 'Subjectless verb-led explanations accumulate into implementation-trace cadence instead of ordinary reader-facing prose.',
    },
  },
  create(ctx) {
    const candidates: Candidate[] = [];
    return {
      Sentence(sentence) {
        if (sentence.words.length < 5) return;
        const root = rootOf(sentence.dep);
        if (!root || root.upos !== 'VERB' || root.id > 3) return;
        const form = root.form.toLowerCase();
        const participle = form.endsWith('ed') || form.endsWith('en') || IRREGULAR_PARTICIPLES.has(form);
        const shorthandVerb = form.endsWith('s') && sentence.words.length >= 8;
        if ((!participle && !shorthandVerb) || COMMAND_VERBS.has(form)) return;
        const children = childrenOf(sentence.dep, root.id);
        if (children.some((child) =>
          child.deprel === 'nsubj'
          || child.deprel.startsWith('nsubj:')
          || child.deprel === 'aux'
          || child.deprel === 'aux:pass')) return;
        const hasExplainedContinuation = sentence.text.includes(':')
          && children.some((child) => child.deprel === 'parataxis' || child.deprel === 'ccomp');
        const strong = hasExplainedContinuation && STRONG_RATIONALE_RE.test(sentence.text);
        candidates.push({ start: sentence.start, end: sentence.end, sentence: sentence.index, strong });
      },
      DocumentExit() {
        for (const candidate of candidates) {
          const localCount = candidates.filter((other) =>
            Math.abs(other.sentence - candidate.sentence) <= 3).length;
          const repeated = localCount >= 2;
          const confidence = candidate.strong || repeated ? 'medium' : 'low';
          ctx.report({
            span: { start: candidate.start, end: candidate.end },
            confidence,
            message: repeated
              ? `${localCount} nearby explanations start with subjectless verbs. The repeated shorthand reads like an implementation trace rather than an explanation for another person.`
              : candidate.strong
                ? 'Agentless rationale chain: a subjectless verb opener jumps directly into compressed rationale. Name the subject, state the behavior, and then explain the reason.'
                : 'Possible agentless implementation fragment. Name what is used, kept, or returned so the comment reads as an explanation rather than a label.',
          });
        }
      },
    };
  },
});
