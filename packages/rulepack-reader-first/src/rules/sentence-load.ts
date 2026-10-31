import { countSentenceUnits, defineRule, type CountPolicy, type Sentence } from 'writinglint-core';

export interface SentenceLoadOptions {
  countPolicy?: CountPolicy;
  reviewWords?: number;
}

/**
 * Sentence load describes how much a reader must hold in mind to follow a sentence.
 *
 * Length alone doesn't measure that. "We went to the store and bought milk and
 * walked home" can run on for a long time, because each part finishes before the
 * next starts. A short sentence is much harder if its subject has to wait for a
 * verb while other clauses open and close in between.
 *
 * The dependency parse shows this directly, because it links each word to the
 * word it depends on. A link that points forward is something the reader is still
 * waiting to resolve.
 *
 * These limits were set against 1,400 sentences from Paul Graham essays, which are
 * long in places but easy to read.
 *
 * - `SPLICED_PARTS`: colons, dashes and brackets joining separate statements into
 *   one sentence, so the reader has to find where each one starts and stops.
 * - `LOST_MAIN_VERB`: words in a sentence whose parse found a clause inside it but
 *   no main verb. Packed sentences confuse the parser, and a reader, this way.
 * - `LONG_WAIT`: nouns and verbs between a subject or object and its later verb.
 * - `HELD_AT_ONCE`: subjects and objects all waiting at the same moment. Sentences
 *   under `HELD_AT_ONCE_MIN_IDEAS` are exempt, since they stay easy to follow.
 * - `INTERRUPTING_CLAUSE_IDEAS`: nouns and verbs inside a clause set off by commas
 *   that sits between a subject and its verb.
 * - `WHETHER_SUBJECT_IDEAS`: nouns and verbs a reader passes after an opening
 *   "Whether" before reaching the last verb, in a sentence with no commas to help.
 * - `DENSE_IDEAS` and `DENSE_SHARE`: nouns plus verbs, when they crowd out the small
 *   words that help a reader. List items count as one, since a list is easy to scan.
 */
const SPLICED_PARTS = 3;
const LOST_MAIN_VERB = 15;
const LONG_WAIT = 4;
const HELD_AT_ONCE = 3;
const HELD_AT_ONCE_MIN_IDEAS = 6;
const INTERRUPTING_CLAUSE_IDEAS = 4;
const WHETHER_SUBJECT_IDEAS = 7;
const DENSE_IDEAS = 11;
const DENSE_SHARE = 0.4;
const VERY_LONG_WORDS = 45;

const CLAUSE_BREAK_RE = /[,;:]|\b(?:although|because|but|except|if|unless|when|whereas|which|while)\b/gi;
const SPLIT_BOUNDARY_RE = /[;:—]|,\s+(?=(?:and|but|so|yet)\b)|\b(?:although|because|but|except|if|unless|when|whereas|which|while)\b/gi;
const TECHNICAL_LABEL_RE = /`[^`\n]+`|\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*_[a-z0-9_]+|[A-Z][A-Z0-9-]{2,})\b/g;
const PUNCTUATION_LOAD_RE = /[;:]|—|\([^()\n]{3,}\)/g;
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

interface Candidate {
  sentence: Sentence;
  words: number;
  clauseBreaks: number;
  labels: number;
  punctuation: number;
  longestWait: number;
  heldAtOnce: number;
  ideas: number;
  overloads: string[];
}

// An opening "When..." or "If..." clause isn't counted, because readers handle it easily.
const WAITING_RELATION_RE = /^(?:nsubj|csubj|obj|iobj)(?::|$)/u;
const isIdea = (upos: string): boolean => upos === 'NOUN' || upos === 'PROPN' || upos === 'VERB';

const CLAUSE_OPENER_RE = /^(?:after|although|because|before|if|once|since|though|unless|when|whenever|where|which|while|who|whom|whose)$/iu;

/**
 * Nested subjects are the sentences the parser is most likely to misread. It can
 * take "offset commit" for a verb, or pick the wrong main verb, and then the waits
 * measured from its tree come out too short.
 *
 * This check only looks at word order and word types, so a wrong tree can't hide
 * the problem. It looks for a clause set off by commas with a verb straight after
 * it, or an opening "Whether" that a reader has to carry for a long way.
 */
function hasNestedSubject(tokens: Sentence['dep']['tokens']): boolean {
  const countIdeas = (part: typeof tokens) => part.filter((token) => isIdea(token.upos)).length;
  const commas = tokens.flatMap((token, index) => token.form === ',' ? [index] : []);
  const interrupted = commas.slice(1).some((close, index) => {
    const open = commas[index]!;
    if (!CLAUSE_OPENER_RE.test(tokens[open + 1]?.form ?? '')) return false;
    const hasSubjectBefore = tokens.slice(0, open).some((token) => isIdea(token.upos) || token.upos === 'PRON');
    const next = tokens.slice(close + 1).find((token) => token.upos !== 'ADV');
    return hasSubjectBefore
      && (next?.upos === 'VERB' || next?.upos === 'AUX')
      && countIdeas(tokens.slice(open + 1, close)) >= INTERRUPTING_CLAUSE_IDEAS;
  });
  if (interrupted) return true;
  if (tokens[0]?.form.toLowerCase() !== 'whether' || commas.length > 0) return false;
  const lastVerb = tokens.map((token) => token.upos).lastIndexOf('VERB');
  return countIdeas(tokens.slice(1, Math.max(lastVerb, 1))) >= WHETHER_SUBJECT_IDEAS;
}

function structureOf(sentence: Sentence) {
  const tokens = sentence.dep.tokens;
  const content = tokens.filter((token) => token.upos !== 'PUNCT');
  const waiting = tokens.filter((token) => WAITING_RELATION_RE.test(token.deprel) && token.id < token.head);
  const longestWait = Math.max(0, ...waiting.map((token) => tokens.filter((other) =>
    other.id > token.id && other.id < token.head && isIdea(other.upos)
    // The items of a list and the parts of a compound name add little to the wait.
    && other.deprel !== 'conj' && other.deprel !== 'compound').length));
  const heldAtOnce = Math.max(0, ...tokens.map((position) =>
    waiting.filter((token) => token.id <= position.id && token.head > position.id).length));
  const ideas = tokens.filter((token) =>
    isIdea(token.upos) && token.deprel !== 'compound' && token.deprel !== 'conj' && !token.deprel.startsWith('flat')).length
    + [...sentence.text.matchAll(TECHNICAL_LABEL_RE)].length;
  const main = tokens.find((token) => token.head === 0);
  const lostMainVerb = content.length >= LOST_MAIN_VERB
    && (main?.upos === 'NOUN' || main?.upos === 'PROPN')
    && tokens.some((token) => token.upos === 'VERB' && /^(?:acl|ccomp|advcl|xcomp)(?::|$)/u.test(token.deprel))
    && !tokens.some((token) => token.head === main.id && (token.deprel === 'cop' || token.deprel.startsWith('nsubj')));
  const splicedParts = [...sentence.text.matchAll(PUNCTUATION_LOAD_RE)].length;
  const overloads = [
    splicedParts >= SPLICED_PARTS ? 'spliced-parts' : '',
    lostMainVerb ? 'lost-main-verb' : '',
    longestWait >= LONG_WAIT ? 'long-wait' : '',
    hasNestedSubject(tokens) ? 'nested-subject' : '',
    heldAtOnce >= HELD_AT_ONCE && ideas >= HELD_AT_ONCE_MIN_IDEAS ? 'held-at-once' : '',
    ideas >= DENSE_IDEAS && ideas / Math.max(content.length, 1) >= DENSE_SHARE ? 'dense-ideas' : '',
  ].filter(Boolean);
  return { longestWait, heldAtOnce, ideas, overloads };
}

const OVERLOAD_ADVICE: Record<string, string> = {
  'spliced-parts': 'Several statements are spliced together with punctuation',
  'lost-main-verb': 'The main verb is hard to find',
  'long-wait': 'A subject or object waits a long time for its verb',
  'nested-subject': 'A long clause sits inside the subject, so the main verb arrives late',
  'held-at-once': 'Several unfinished clauses are open at the same moment',
  'dense-ideas': 'It packs in many nouns and verbs',
};

function labelCount(sentence: Sentence): number {
  const lexical = [...sentence.text.matchAll(TECHNICAL_LABEL_RE)].length;
  const properNames = sentence.words.filter((token, index) => token.upos === 'PROPN' && index > 0).length;
  return lexical + properNames;
}

function splitAnchors(sentence: Sentence): Array<{ kind: string; offset: number; label: string }> {
  return [...sentence.text.matchAll(SPLIT_BOUNDARY_RE)].flatMap((match) => {
    const localOffset = match.index! + (/^[;:—,]/.test(match[0]) ? match[0].length : 0);
    const before = sentence.text.slice(0, localOffset).match(WORD_RE)?.length ?? 0;
    const after = sentence.text.slice(localOffset).match(WORD_RE)?.length ?? 0;
    if (before < 6 || after < 6) return [];
    return [{
      kind: 'split-point',
      offset: sentence.start + localOffset,
      label: match[0].trim() || 'clause boundary',
    }];
  });
}

/** Sentences whose structure makes the reader hold too much in mind at once. */
export const sentenceLoad = defineRule<SentenceLoadOptions>({
  meta: {
    name: 'sentence-load',
    category: 'load',
    defaultSeverity: 'warn',
    defaultConfidence: 'medium',
    requires: { parser: ['sentence-boundaries', 'tokens', 'part-of-speech'] },
    docs: {
      description: 'A sentence makes the reader hold too much open at once, such as a subject waiting far from its verb. Length alone only earns a note.',
    },
  },
  create(context) {
    const candidates: Candidate[] = [];
    const reviewWords = context.options.reviewWords ?? 24;
    return {
      Sentence(sentence) {
        const words = countSentenceUnits(sentence, context.doc, context.options.countPolicy).length;
        const structure = structureOf(sentence);
        const clauseBreaks = [...sentence.text.matchAll(CLAUSE_BREAK_RE)].length;
        const labels = labelCount(sentence);
        const punctuation = [...sentence.text.matchAll(PUNCTUATION_LOAD_RE)].length;
        const review = words >= reviewWords && (clauseBreaks >= 2 || labels >= 2 || punctuation >= 1);
        if (structure.overloads.length === 0 && !review && words < VERY_LONG_WORDS) return;
        candidates.push({ sentence, words, clauseBreaks, labels, punctuation, ...structure });
      },
      DocumentExit() {
        for (const candidate of candidates) {
          const localCount = candidates.filter((other) =>
            Math.abs(other.sentence.index - candidate.sentence.index) <= 2
            && Math.abs(other.sentence.start - candidate.sentence.start) <= 700
            && other.overloads.length >= 1).length;
          // Length never raises this past a note. Only overloaded structure does.
          const confidence = candidate.overloads.length >= 3 || (localCount >= 3 && candidate.overloads.length >= 1)
            ? 'high'
            : candidate.overloads.length >= 1 ? 'medium' : 'low';
          const reasons = candidate.overloads.map((name) => OVERLOAD_ADVICE[name]).join('. ');
          context.report({
            span: { start: candidate.sentence.start, end: candidate.sentence.end },
            confidence,
            message: reasons
              ? `${reasons}. This sentence has ${candidate.words} words, a longest wait of ${candidate.longestWait} nouns and verbs, and ${candidate.heldAtOnce} unfinished parts open at once. Keep one main point, then move the rest into separate sentences.`
              : `This sentence has ${candidate.words} words and ${candidate.clauseBreaks} clause breaks, but its structure is simple. Split it only if the point gets lost.`,
            anchors: splitAnchors(candidate.sentence),
            magnitude: {
              metrics: [
                { name: 'words', value: candidate.words, unit: 'words', threshold: VERY_LONG_WORDS, excess: Math.max(0, candidate.words - VERY_LONG_WORDS) },
                { name: 'longest-wait', value: candidate.longestWait, unit: 'nouns and verbs', threshold: LONG_WAIT, excess: Math.max(0, candidate.longestWait - LONG_WAIT) },
                { name: 'held-at-once', value: candidate.heldAtOnce, unit: 'open parts', threshold: HELD_AT_ONCE, excess: Math.max(0, candidate.heldAtOnce - HELD_AT_ONCE) },
                { name: 'ideas', value: candidate.ideas, unit: 'nouns and verbs', threshold: DENSE_IDEAS, excess: Math.max(0, candidate.ideas - DENSE_IDEAS) },
              ],
            },
            evidence: [{
              kind: 'sentence-load',
              data: {
                words: candidate.words,
                clauseBreaks: candidate.clauseBreaks,
                technicalLabels: candidate.labels,
                punctuation: candidate.punctuation,
                nearbyLoadedSentences: localCount,
                longestWait: candidate.longestWait,
                heldAtOnce: candidate.heldAtOnce,
                ideas: candidate.ideas,
                overloads: candidate.overloads.join(', '),
                reviewWords,
              },
            }],
          });
        }
      },
    };
  },
});
