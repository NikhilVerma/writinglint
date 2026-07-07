/**
 * Feature extraction for the stylometric AI-writing classifier.
 *
 * Method, standing on prior work (we don't reinvent it, we extend it):
 *  - BASE — DependencyAI (arXiv 2602.15514): the sequence of dependency-relation
 *    LABELS (words discarded), later TF-IDF-vectorised as uni/bi-grams. ~89% F1.
 *  - EXTENSION 1 — POS (UPOS) n-grams, the other cheap structural signal.
 *  - EXTENSION 2 — interpretable stylometric scalars (burstiness, type-token
 *    ratio, POS/deprel ratios, copula ratio, dependency distance …), which the
 *    survey literature (StyloAI et al.) shows help and, crucially, are what make
 *    the score explainable to a writer.
 *  - EXTENSION 3 — our "hollowness" rule rates (copula avoidance, vague
 *    attribution, participial appendage …): the constructions that make AI prose
 *    grand-but-empty. These are the features the product also turns into fixes.
 *
 * This module produces the RAW per-document features. The n-gram sequences are
 * TF-IDF-vectorised by the classifier (which owns the fitted vocabulary/IDF);
 * the scalars are returned as a named record.
 */
import type { Document, Lint } from '@writinglint/core';

export interface DocFeatures {
  /** Dependency-relation label sequence (per sentence, in token order). */
  deprel: string[];
  /** UPOS sequence. */
  pos: string[];
  /** Named interpretable scalar features. */
  scalars: Record<string, number>;
}

const div = (a: number, b: number): number => (b > 0 ? a / b : 0);

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Depth of a token in its sentence's tree (root = 0), capped to avoid cycles. */
function depth(sentTokens: { id: number; head: number }[], id: number): number {
  let d = 0;
  let cur = id;
  const byId = new Map(sentTokens.map((t) => [t.id, t.head]));
  while (byId.get(cur) && byId.get(cur) !== 0 && d < 64) {
    cur = byId.get(cur)!;
    d++;
  }
  return d;
}

/**
 * Extract features from a linted document. `lints` are the rule hits (for the
 * hollowness-rate features); `doc` carries the parse. The scalar feature KEYS
 * (r_*, c_*) are a stable ABI — the shipped classifier.json aligns to them — so
 * they must not be renamed even as the rules that feed them are.
 */
export function docFeatures(doc: Document, lints: Lint[]): DocFeatures {
  const ctx = doc;
  const findings = lints;
  const deprel: string[] = [];
  const pos: string[] = [];

  // POS / deprel tallies
  const uposCount = new Map<string, number>();
  const deprelCount = new Map<string, number>();
  let tokenCount = 0;
  let copCount = 0;
  let rootVerb = 0;
  let depDistSum = 0;
  let depthSum = 0;
  const sentLens: number[] = [];

  for (const s of ctx.sentences) {
    const toks = s.dep.tokens;
    let contentWords = 0;
    for (const t of toks) {
      tokenCount++;
      deprel.push(t.deprel);
      pos.push(t.upos);
      uposCount.set(t.upos, (uposCount.get(t.upos) ?? 0) + 1);
      const baseRel = t.deprel.split(':')[0];
      deprelCount.set(baseRel, (deprelCount.get(baseRel) ?? 0) + 1);
      if (t.deprel === 'cop') copCount++;
      if (t.head === 0 && t.upos === 'VERB') rootVerb++;
      if (t.head !== 0) depDistSum += Math.abs(t.head - t.id);
      depthSum += depth(toks, t.id);
      if (t.upos !== 'PUNCT' && t.upos !== 'SYM') contentWords++;
    }
    sentLens.push(contentWords);
  }

  const words = ctx.tokens; // non-punct tokens
  const nWords = Math.max(1, words.length);
  const lowerForms = words.map((w) => w.lower);
  const types = new Set(lowerForms);
  const freq = new Map<string, number>();
  for (const w of lowerForms) freq.set(w, (freq.get(w) ?? 0) + 1);
  const hapax = [...freq.values()].filter((c) => c === 1).length;

  const uposRate = (tag: string) => div(uposCount.get(tag) ?? 0, nWords);
  const deprelRate = (rel: string) => div(deprelCount.get(rel) ?? 0, nWords);

  // hollowness rule rates (per 100 words), by rule short-name (ruleId sans 'pack/')
  const ruleCount = new Map<string, number>();
  const catCount = new Map<string, number>();
  for (const f of findings) {
    const short = f.ruleId.slice(f.ruleId.indexOf('/') + 1);
    ruleCount.set(short, (ruleCount.get(short) ?? 0) + 1);
    catCount.set(f.category, (catCount.get(f.category) ?? 0) + 1);
  }
  const per100 = (n: number) => div(n, nWords) * 100;

  const punct = ctx.text.replace(/[^\p{P}]/gu, '').length;
  const commas = (ctx.text.match(/,/g) ?? []).length;

  const scalars: Record<string, number> = {
    // ── surface / stylometric ──
    meanSentLen: div(sentLens.reduce((a, b) => a + b, 0), sentLens.length),
    sdSentLen: stdev(sentLens), // burstiness
    cvSentLen: div(stdev(sentLens), div(sentLens.reduce((a, b) => a + b, 0), sentLens.length)),
    meanWordLen: div(words.reduce((a, w) => a + (w.end - w.start), 0), nWords),
    typeTokenRatio: div(types.size, nWords),
    hapaxRatio: div(hapax, nWords),
    commaRate: div(commas, ctx.sentences.length || 1),
    punctRatio: div(punct, ctx.text.length || 1),

    // ── POS ratios ──
    adjRatio: uposRate('ADJ'),
    advRatio: uposRate('ADV'),
    nounRatio: uposRate('NOUN'),
    propnRatio: uposRate('PROPN'),
    verbRatio: uposRate('VERB'),
    adpRatio: uposRate('ADP'),
    detRatio: uposRate('DET'),
    pronRatio: uposRate('PRON'),
    cconjRatio: uposRate('CCONJ'),
    sconjRatio: uposRate('SCONJ'),
    auxRatio: uposRate('AUX'),
    numRatio: uposRate('NUM'),
    functionWordRatio:
      uposRate('DET') + uposRate('ADP') + uposRate('PRON') + uposRate('CCONJ') + uposRate('SCONJ') + uposRate('AUX') + uposRate('PART'),

    // ── dependency ratios ──
    amodRate: deprelRate('amod'),
    advmodRate: deprelRate('advmod'),
    conjRate: deprelRate('conj'),
    ccRate: deprelRate('cc'),
    ccompRate: deprelRate('ccomp'),
    xcompRate: deprelRate('xcomp'),
    advclRate: deprelRate('advcl'),
    aclRate: deprelRate('acl'),
    nmodRate: deprelRate('nmod'),
    oblRate: deprelRate('obl'),
    apposRate: deprelRate('appos'),
    nsubjRate: deprelRate('nsubj'),
    copRatio: div(copCount, copCount + rootVerb), // copula vs verbal predication
    meanDepDist: div(depDistSum, tokenCount),
    meanTreeDepth: div(depthSum, tokenCount),

    // ── hollowness rule rates (per 100 words) ──
    // Keys are the stable feature ABI; values now count the renamed rules.
    r_copulaAvoid: per100(ruleCount.get('copula-avoidance') ?? 0),
    r_vagueAttr: per100(ruleCount.get('vague-attribution') ?? 0),
    r_participial: per100(ruleCount.get('participial-appendage') ?? 0),
    r_negParallel: per100(ruleCount.get('negative-parallelism') ?? 0),
    r_triad: per100(ruleCount.get('rule-of-three') ?? 0),
    r_lightVerb: per100(ruleCount.get('light-verb-role') ?? 0),
    r_throatClear: per100(ruleCount.get('throat-clearing') ?? 0),
    c_aiVocab: per100(catCount.get('ai-vocab') ?? 0),
    c_significance: per100(catCount.get('significance') ?? 0),
    c_promo: per100(catCount.get('promo') ?? 0),
    c_meta: per100(catCount.get('meta') ?? 0),
    c_formatting: per100(catCount.get('formatting') ?? 0),
    c_conjunctions: per100(catCount.get('conjunctions') ?? 0),
  };

  return { deprel, pos, scalars };
}

/** Stable ordered list of scalar feature names (for vectorising). */
export function scalarNames(f: DocFeatures): string[] {
  return Object.keys(f.scalars).sort();
}
