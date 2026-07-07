/**
 * Structural rules — Wikipedia's "signs of AI writing" that are CONSTRUCTIONS,
 * detected as shapes in the dependency graph rather than word lists. Any words
 * can fill the slots; we match the syntax.
 *
 * Where a slot is irreducibly SEMANTIC (a POS tagger can't tell an *importance*
 * adjective from any adjective), a small closed seed narrows it — but the
 * surrounding STRUCTURE always comes from the parse, so paraphrases are caught.
 */
import type { DepToken } from 'nlpgraph';
import type { Category, Context, Finding } from './types.js';
import {
  child,
  childrenByRel,
  childrenOf,
  hasChild,
  isGerund,
  lower,
  spanOf,
  subtree,
  type DepSentence,
} from './graph.js';

// ── small semantic seeds (the only place words appear, and by necessity) ─────
const COPULA_SUB = new Set([
  'stand', 'stands', 'stood', 'serve', 'serves', 'served', 'act', 'acts', 'acted',
  'function', 'functions', 'functioned', 'emerge', 'emerges', 'emerged', 'represent',
  'represents', 'remain', 'remains', 'remained', 'constitute', 'constitutes', 'embody', 'embodies',
]);
const LIGHT_VERB = new Set([
  'play', 'plays', 'played', 'serve', 'serves', 'served', 'occupy', 'occupies', 'occupied',
  'hold', 'holds', 'held', 'assume', 'assumes', 'assumed', 'fill', 'fills', 'filled',
]);
const ROLE_NOUN = new Set(['role', 'part', 'function']);
const IMPORTANCE_ADJ = new Set([
  'important', 'critical', 'crucial', 'essential', 'vital', 'key', 'necessary',
  'noteworthy', 'worth', 'worthwhile', 'useful', 'helpful', 'significant', 'imperative', 'interesting',
]);
const COGNITION_VERB = new Set([
  'note', 'mention', 'remember', 'understand', 'consider', 'recognize', 'recognise',
  'realize', 'realise', 'appreciate', 'emphasize', 'emphasise', 'highlight', 'acknowledge',
  'stress', 'underscore', 'clarify', 'point',
]);
// Verbs of saying/attribution — the semantic half of vague attribution (the
// structural half is a bare, generic subject). "features mean that …" isn't
// weasel; "experts argue that …" is.
const SAYING_VERB = new Set([
  'argue', 'argues', 'argued', 'say', 'says', 'said', 'claim', 'claims', 'claimed', 'suggest',
  'suggests', 'suggested', 'contend', 'contends', 'maintain', 'maintains', 'assert', 'asserts',
  'insist', 'insists', 'believe', 'believes', 'report', 'reports', 'reported', 'observe',
  'observes', 'observed', 'agree', 'agrees', 'warn', 'warns', 'predict', 'predicts', 'indicate',
  'indicates', 'reveal', 'reveals', 'show', 'shows', 'conclude', 'concludes', 'posit', 'posits',
  'allege', 'alleges', 'acknowledge', 'acknowledges', 'note', 'notes',
]);
// Editorialising gerunds — the semantic half of the participial-appendage tell
// (vacuous significance). "…, showcasing its heritage" vs human "…, trying to fix it".
const EDITORIAL_GERUND = new Set([
  'showcasing', 'highlighting', 'underscoring', 'emphasizing', 'emphasising', 'reflecting',
  'symbolizing', 'symbolising', 'cementing', 'solidifying', 'reinforcing', 'exemplifying',
  'demonstrating', 'fostering', 'cultivating', 'signaling', 'signalling', 'embodying',
  'epitomizing', 'epitomising', 'illustrating', 'affirming', 'reshaping', 'redefining',
]);
// Adverbs that give the "not ONLY … but ALSO …" cadence (vs a plain human contrast).
const PARALLEL_MARKER = new Set(['only', 'just', 'merely', 'simply', 'also', 'too']);

type StructRule = (s: DepSentence) => Finding[];

/** Build a finding spanning `toks`. `text` is filled in by structuralFindings. */
function mk(s: DepSentence, toks: DepToken[], category: Category, message: string, rule: string): Finding {
  const { start, end } = spanOf(s, toks);
  return { start, end, category, text: '', message, rule };
}

/**
 * Rule of three — a head with ≥2 `conj` siblings of its OWN part of speech,
 * restricted to ADJ/ADV so we flag rhetorical triads, not itemised noun lists.
 */
const triad: StructRule = (s) => {
  const out: Finding[] = [];
  for (const h of s.tokens) {
    // Head must be adjectival/adverbial (excludes itemised noun lists). The
    // conj children aren't upos-filtered: a participial adjective coordinated
    // with an adjective ("lush, sprawling, and chaotic") is often mistagged
    // VERB, but it's still an adjectival co-modifier.
    if (h.upos !== 'ADJ' && h.upos !== 'ADV') continue;
    if (h.deprel !== 'amod' && h.deprel !== 'advmod' && h.deprel !== 'root' && h.deprel !== 'conj')
      continue;
    const conj = childrenByRel(s, h.id, 'conj');
    if (conj.length >= 2) {
      const members = [h, ...conj];
      out.push(
        mk(
          s,
          members,
          'rule-of-three',
          'Three coordinated ' + (h.upos === 'ADJ' ? 'adjectives' : 'adverbs') + ' — a reflexive triad. Two usually do the work of three.',
          'triad',
        ),
      );
    }
  }
  return out;
};

/**
 * Negative parallelism — a coordination whose coordinator is "but" and whose
 * first conjunct is negated ("not [only] X but [also] Y").
 */
const negParallel: StructRule = (s) => {
  const out: Finding[] = [];
  for (const y of s.tokens) {
    if (y.deprel !== 'conj') continue;
    const cc = child(s, y.id, 'cc');
    if (!cc || lower(cc) !== 'but') continue;
    const x = s.tokens[y.head - 1]?.id === y.head ? s.tokens[y.head - 1] : s.tokens.find((t) => t.id === y.head);
    if (!x) continue;
    const xAdv = childrenOf(s, x.id).map(lower);
    if (!xAdv.includes('not') && !xAdv.includes('neither')) continue;
    // Require the "only/just/merely" or "also/too" marker — that's the AI
    // cadence. A plain "not X but Y" contrast is ordinary human writing.
    const yAdv = childrenOf(s, y.id).map(lower);
    if (![...xAdv, ...yAdv].some((w) => PARALLEL_MARKER.has(w))) continue;
    const toks = [...subtree(s, x.id), ...subtree(s, y.id)];
    out.push(
      mk(s, toks, 'parallelism', '“Not (only) X but (also) Y” — a signature LLM cadence built on a negated coordination.', 'neg-parallel'),
    );
  }
  return out;
};

/**
 * Participial appendage — a sentence-final `-ing` clause (`advcl`/`acl`) hung off
 * the main clause after a comma. The AI "superficial analysis" tell.
 */
const appendage: StructRule = (s) => {
  const out: Finding[] = [];
  for (const g of s.tokens) {
    if (g.deprel !== 'advcl' && g.deprel !== 'acl') continue;
    if (g.upos !== 'VERB' || !isGerund(g)) continue;
    if (!EDITORIAL_GERUND.has(lower(g))) continue; // editorialising, not narrative
    if (g.id <= g.head) continue; // must trail its head
    const before = s.tokens[g.id - 2]; // token immediately before g
    if (!before || before.form !== ',') continue;
    out.push(
      mk(s, subtree(s, g.id), 'significance', 'Trailing “-ing” clause that editorialises the main clause — a hallmark of AI summary prose.', 'participial-appendage'),
    );
  }
  return out;
};

/**
 * Copula avoidance — a non-"be" verb predicating via "as a NOUN"
 * ("X stands/serves as a testament"), instead of a plain "is".
 */
const copulaAvoid: StructRule = (s) => {
  const out: Finding[] = [];
  for (const v of s.tokens) {
    if (v.upos !== 'VERB' || !COPULA_SUB.has(lower(v))) continue;
    if (!hasChild(s, v.id, 'nsubj')) continue;
    const obl = childrenByRel(s, v.id, 'obl').find(
      (o) => (o.upos === 'NOUN' || o.upos === 'PROPN') && childrenOf(s, o.id).some((c) => c.deprel === 'case' && lower(c) === 'as'),
    );
    if (!obl) continue;
    out.push(
      mk(s, [v, ...subtree(s, obl.id)], 'significance', `Copula avoidance — “${lower(v)} as a …” dressing up a plain “is a …”.`, 'copula-avoid'),
    );
  }
  return out;
};

/** Light-verb significance — "plays/serves a [ADJ] role/part" (adjective open). */
const lightVerbRole: StructRule = (s) => {
  const out: Finding[] = [];
  for (const v of s.tokens) {
    if (v.upos !== 'VERB' || !LIGHT_VERB.has(lower(v))) continue;
    const obj = childrenByRel(s, v.id, 'obj').find((o) => ROLE_NOUN.has(lower(o)));
    if (!obj) continue;
    const amod = childrenByRel(s, obj.id, 'amod').find((a) => a.upos === 'ADJ');
    if (!amod) continue;
    out.push(
      mk(s, [v, ...subtree(s, obj.id)], 'significance', 'Light-verb inflation — “plays a … role” asserts importance without saying what it does.', 'light-verb-role'),
    );
  }
  return out;
};

/**
 * Vague attribution — a bare (determiner-less) noun subject that heads a clause
 * of assertion (`ccomp`): "Experts argue that …", "Studies suggest that …". The
 * "who says so?" is generic, and we detect it structurally (no `det` on nsubj).
 */
const vagueAttribution: StructRule = (s) => {
  const out: Finding[] = [];
  for (const v of s.tokens) {
    if (v.upos !== 'VERB') continue;
    if (!hasChild(s, v.id, 'ccomp')) continue;
    if (!SAYING_VERB.has(lower(v))) continue; // an attribution verb, not "features mean …"
    // A common (not proper) noun subject with no determiner = a generic,
    // unnamed authority. A named person ("Rich Skrenta writes") is specific.
    const subj = childrenByRel(s, v.id, 'nsubj').find(
      (n) => n.upos === 'NOUN' && !hasChild(s, n.id, 'det') && !hasChild(s, n.id, 'nmod:poss'),
    );
    if (!subj) continue;
    out.push(
      mk(s, [...subtree(s, subj.id), v], 'vague', 'Unattributed claim — a bare, generic subject asserting a “that …” clause. Name who, or cut it.', 'vague-attribution'),
    );
  }
  return out;
};

/**
 * Chatbot throat-clearing — expletive-"it" + copula + [importance adj] + to +
 * [cognition verb]: "It is important to note that …". Structure from the parse;
 * the two adjective/verb slots are small semantic seeds (POS can't open them).
 */
const throatClearing: StructRule = (s) => {
  const out: Finding[] = [];
  for (const adj of s.tokens) {
    if (adj.upos !== 'ADJ' || !IMPORTANCE_ADJ.has(lower(adj))) continue;
    if (!hasChild(s, adj.id, 'cop')) continue;
    const subj = child(s, adj.id, 'nsubj');
    if (!subj || lower(subj) !== 'it') continue;
    const verb = childrenOf(s, adj.id).find(
      (c) => (c.deprel === 'xcomp' || c.deprel === 'csubj' || c.deprel === 'advcl' || c.deprel === 'acl') && c.upos === 'VERB' && COGNITION_VERB.has(lower(c)),
    );
    if (!verb) continue;
    out.push(
      mk(s, [subj, ...subtree(s, adj.id)], 'meta', 'Throat-clearing (“it is important to note that …”). If it matters, just say it.', 'throat-clearing'),
    );
  }
  return out;
};

const STRUCT_RULES: StructRule[] = [
  triad,
  negParallel,
  appendage,
  copulaAvoid,
  lightVerbRole,
  vagueAttribution,
  throatClearing,
];

/** Run every structural rule over each parsed sentence, filling in finding text. */
export function structuralFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  for (const sent of ctx.sentences) {
    if (!sent.dep) continue;
    for (const rule of STRUCT_RULES) {
      for (const f of rule(sent.dep)) {
        out.push({ ...f, text: ctx.text.slice(f.start, f.end) });
      }
    }
  }
  return out;
}
