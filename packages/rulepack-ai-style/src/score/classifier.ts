/**
 * Stylometric classifier — the SOTA-with-POS+graph detector.
 *
 * Method (following the literature, not reinventing it):
 *  - DependencyAI's core: TF-IDF over dependency-relation-label uni/bi-grams.
 *  - our extensions: POS uni/bi-grams + standardised interpretable scalars
 *    (burstiness, type-token ratio, POS/deprel ratios, copula ratio, and the
 *    hollowness-rule rates) — see features.ts.
 *  - a standard L2-regularised logistic regression (calibrated probability,
 *    fully deterministic, serialises to plain JSON so the trained MODEL ships
 *    open-source while the training DATA stays closed).
 *
 * The model file is data-free (just vocabulary + weights), so committing it
 * leaks none of the closed corpus.
 */
import type { DocFeatures } from './features.js';

// ── n-gram helpers ────────────────────────────────────────────────────────────
function ngrams(seq: string[], prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < seq.length; i++) {
    out.push(`${prefix}:${seq[i]}`);
    if (i + 1 < seq.length) out.push(`${prefix}:${seq[i]}|${seq[i + 1]}`);
  }
  return out;
}

/** Bag of TF-IDF n-gram terms for a document (deprel + POS uni/bi-grams). */
function docTerms(f: DocFeatures): Map<string, number> {
  const bag = new Map<string, number>();
  for (const g of [...ngrams(f.deprel, 'd'), ...ngrams(f.pos, 'p')])
    bag.set(g, (bag.get(g) ?? 0) + 1);
  return bag;
}

export interface Model {
  vocab: string[]; // ordered n-gram vocabulary
  idf: number[]; // aligned to vocab
  scalarNames: string[];
  scalarMean: number[];
  scalarStd: number[];
  weights: number[]; // aligned to [vocab..., scalars...]
  bias: number;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

// ── vectorisation ─────────────────────────────────────────────────────────────
/** Build the n-gram vocabulary + IDF and the scalar standardisation from a training set. */
export function fitVectorizer(
  docs: DocFeatures[],
  opts: { minDf?: number } = {},
): Pick<Model, 'vocab' | 'idf' | 'scalarNames' | 'scalarMean' | 'scalarStd'> {
  const minDf = opts.minDf ?? 2;
  const df = new Map<string, number>();
  for (const f of docs) for (const term of docTerms(f).keys()) df.set(term, (df.get(term) ?? 0) + 1);

  const vocab = [...df.entries()].filter(([, c]) => c >= minDf).map(([t]) => t).sort();
  const N = docs.length;
  const idf = vocab.map((t) => Math.log((1 + N) / (1 + (df.get(t) ?? 0))) + 1);

  const scalarNames = Object.keys(docs[0]?.scalars ?? {}).sort();
  const scalarMean = scalarNames.map(
    (n) => docs.reduce((a, d) => a + (d.scalars[n] ?? 0), 0) / Math.max(1, docs.length),
  );
  const scalarStd = scalarNames.map((n, i) => {
    const v =
      docs.reduce((a, d) => a + ((d.scalars[n] ?? 0) - scalarMean[i]) ** 2, 0) /
      Math.max(1, docs.length);
    return Math.sqrt(v) || 1;
  });
  return { vocab, idf, scalarNames, scalarMean, scalarStd };
}

/** Transform one document to the model's feature vector (TF-IDF ngrams ++ z-scaled scalars). */
export function vectorize(m: Omit<Model, 'weights' | 'bias'>, f: DocFeatures): number[] {
  const bag = docTerms(f);
  const idx = new Map(m.vocab.map((t, i) => [t, i]));
  const tfidf = new Array(m.vocab.length).fill(0);
  for (const [term, tf] of bag) {
    const i = idx.get(term);
    if (i !== undefined) tfidf[i] = tf * m.idf[i];
  }
  const norm = Math.sqrt(tfidf.reduce((a, b) => a + b * b, 0)) || 1;
  for (let i = 0; i < tfidf.length; i++) tfidf[i] /= norm; // L2-normalise ngram block

  const scaled = m.scalarNames.map((n, i) => ((f.scalars[n] ?? 0) - m.scalarMean[i]) / m.scalarStd[i]);
  return [...tfidf, ...scaled];
}

// ── logistic regression (L2, deterministic batch gradient descent) ────────────
export function trainLogReg(
  X: number[][],
  y: number[],
  opts: { l2?: number; lr?: number; epochs?: number } = {},
): { weights: number[]; bias: number } {
  const l2 = opts.l2 ?? 1.0;
  const lr = opts.lr ?? 0.1;
  const epochs = opts.epochs ?? 500;
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const w = new Array(d).fill(0);
  let b = 0;

  for (let e = 0; e < epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + (l2 * w[j]) / n);
    b -= lr * (gb / n);
  }
  return { weights: w, bias: b };
}

/** Probability that a document is AI-generated, given a trained model. */
export function predict(m: Model, f: DocFeatures): number {
  const x = vectorize(m, f);
  let z = m.bias;
  for (let j = 0; j < x.length; j++) z += m.weights[j] * x[j];
  return sigmoid(z);
}

/** Fit a full model (vectorizer + logistic regression) on labeled documents. */
export function trainModel(
  docs: DocFeatures[],
  labels: number[],
  opts: { minDf?: number; l2?: number; lr?: number; epochs?: number } = {},
): Model {
  const vec = fitVectorizer(docs, opts);
  const X = docs.map((f) => vectorize(vec, f));
  const { weights, bias } = trainLogReg(X, labels, opts);
  return { ...vec, weights, bias };
}
