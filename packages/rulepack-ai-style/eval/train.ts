/**
 * Train + honestly evaluate the stylometric classifier.
 *
 * LESSON (the hard way): a model trained on a narrow human slice + one AI family
 * scored AUC 0.997 on same-distribution held-out but 0.65 on diverse data — it
 * had learned the distribution, not "human vs AI". So we train on the DIVERSE
 * real pool (`corpus` + `benchmark`) and hold out a stratified BLIND slice of the
 * same distribution. The narrower `heldout` split is kept as an
 * out-of-distribution probe.
 *
 * Writes models/classifier.json — a DATA-FREE model (vocab + weights only).
 * Run: npm run train
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Linter, resolveConfig } from 'writinglint-core';
import { loadParser } from 'writinglint-parser-node';
import { recommended } from '../src/index.js';
import { docFeatures, predict, trainModel, type DocFeatures, type Model } from '../src/score/index.js';
import { loadDocs, mean, type Doc } from './lib.js';

const MODEL_PATH = fileURLToPath(new URL('../model/classifier.json', import.meta.url));

interface Row { doc: Doc; label: number }

// The diverse REAL pool: `corpus` + `benchmark` (varied human + varied AI).
function realPool(): Row[] {
  const out: Row[] = [];
  for (const split of ['corpus', 'benchmark'] as const) {
    for (const doc of loadDocs(split, 'human')) out.push({ doc, label: 0 });
    for (const doc of loadDocs(split, 'ai')) out.push({ doc, label: 1 });
  }
  return out;
}

/**
 * Deterministic stratified split (no RNG in this runtime): within each
 * (source × label) bucket, sorted by id, every 4th doc → blind test (~25%).
 * Guarantees every source and both classes appear in both train and test.
 */
function split(rows: Row[]): { train: Row[]; test: Row[] } {
  const buckets = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.doc.split}/${r.label}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r);
  }
  const train: Row[] = [], test: Row[] = [];
  for (const b of buckets.values()) {
    b.sort((a, c) => a.doc.id.localeCompare(c.doc.id));
    b.forEach((r, i) => (i % 4 === 3 ? test : train).push(r));
  }
  return { train, test };
}

function folds(labels: number[], k: number): number[][] {
  const byClass = new Map<number, number[]>();
  labels.forEach((y, i) => (byClass.get(y) ?? byClass.set(y, []).get(y)!).push(i));
  const out: number[][] = Array.from({ length: k }, () => []);
  for (const idxs of byClass.values()) idxs.forEach((i, j) => out[j % k].push(i));
  return out;
}

function metrics(probs: number[], y: number[], thr: number) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < y.length; i++) {
    const pred = probs[i] >= thr ? 1 : 0;
    if (pred && y[i]) tp++;
    else if (pred && !y[i]) fp++;
    else if (!pred && !y[i]) tn++;
    else fn++;
  }
  const p = tp + fp ? tp / (tp + fp) : 1;
  const r = tp + fn ? tp / (tp + fn) : 1;
  const spec = tn + fp ? tn / (tn + fp) : 1;
  return { p, r, spec, f1: p + r ? (2 * p * r) / (p + r) : 0 };
}

function aucProb(probs: number[], y: number[]): number {
  const pos = probs.filter((_, i) => y[i] === 1);
  const neg = probs.filter((_, i) => y[i] === 0);
  if (!pos.length || !neg.length) return 0;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const parser = await loadParser();
const linter = new Linter(parser);
const config = resolveConfig(recommended);
async function featurize(rows: Row[]) {
  const f: DocFeatures[] = [], y: number[] = [];
  for (const { doc: row, label } of rows) {
    const { doc, lints } = await linter.lint(row.text, config);
    f.push(docFeatures(doc, lints));
    y.push(label);
  }
  return { f, y };
}

const pool = realPool();
if (!pool.length) {
  console.log('No training data. Build eval/data/{corpus,benchmark}/ (see eval/data/README.md).');
  process.exit(0);
}
const { train, test } = split(pool);
const ood = [ // out-of-distribution probe: the narrower `heldout` split
  ...loadDocs('heldout', 'human').map((doc) => ({ doc, label: 0 })),
  ...loadDocs('heldout', 'ai').map((doc) => ({ doc, label: 1 })),
];
console.log(
  `Real pool ${pool.length}: train ${train.length} (${train.filter((r) => !r.label).length}h/${train.filter((r) => r.label).length}a)` +
    ` | blind test ${test.length} | OOD probe ${ood.length}`,
);
console.log('Parsing + extracting features…');
const { f: feats, y: labels } = await featurize(train);
const { f: testF, y: testY } = await featurize(test);
const { f: oodF, y: oodY } = await featurize(ood);

// ── stratified 5-fold CV on the train pool ────────────────────────────────────
const K = 5;
const fold = folds(labels, K);
const oof = new Array(labels.length).fill(0);
for (let k = 0; k < K; k++) {
  const held = new Set(fold[k]);
  const trF: DocFeatures[] = [], trY: number[] = [];
  labels.forEach((y, i) => { if (!held.has(i)) { trF.push(feats[i]); trY.push(y); } });
  const m = trainModel(trF, trY, { minDf: 2, l2: 1.0, lr: 0.3, epochs: 400 });
  for (const i of fold[k]) oof[i] = predict(m, feats[i]);
}
const cvAuc = aucProb(oof, labels);
const cvBest = Array.from({ length: 99 }, (_, t) => (t + 1) / 100)
  .map((thr) => ({ thr, ...metrics(oof, labels, thr) }))
  .sort((a, b) => b.f1 - a.f1)[0];

function report(title: string, f: DocFeatures[], y: number[], m: Model, thr: number) {
  if (!y.length) return { auc: 1, f1: 1, p: 1, r: 1, spec: 1 };
  const probs = f.map((x) => predict(m, x));
  const mm = metrics(probs, y, thr);
  const a = aucProb(probs, y);
  console.log(`\n${'═'.repeat(58)}\n  ${title}\n${'═'.repeat(58)}`);
  console.log(`  ROC-AUC ${a.toFixed(3)}   F1 ${mm.f1.toFixed(3)}   P ${mm.p.toFixed(3)}  R ${mm.r.toFixed(3)}  spec ${mm.spec.toFixed(3)}`);
  console.log(`  mean prob   human ${mean(probs.filter((_, i) => !y[i])).toFixed(3)}   ai ${mean(probs.filter((_, i) => y[i])).toFixed(3)}`);
  return { auc: a, ...mm };
}

console.log(`\n${'═'.repeat(58)}\n  5-fold CV (out-of-fold) — diverse real pool\n${'═'.repeat(58)}`);
console.log(`  ROC-AUC ${cvAuc.toFixed(3)}   best F1 ${cvBest.f1.toFixed(3)} @ ${cvBest.thr.toFixed(2)}  (P ${cvBest.p.toFixed(3)} R ${cvBest.r.toFixed(3)} spec ${cvBest.spec.toFixed(3)})`);

const model = trainModel(feats, labels, { minDf: 2, l2: 1.0, lr: 0.3, epochs: 600 });
const blind = report('BLIND TEST — held-out slice of the diverse real pool (honest)', testF, testY, model, cvBest.thr);
const oodR = report('OOD PROBE — narrower held-out split', oodF, oodY, model, cvBest.thr);

mkdirSync(fileURLToPath(new URL('../model', import.meta.url)), { recursive: true });
writeFileSync(MODEL_PATH, JSON.stringify(model));
console.log(`\nSaved model (${model.vocab.length} ngram + ${model.scalarNames.length} scalar) → model/classifier.json  [threshold ${cvBest.thr.toFixed(2)}]`);

// ── regression guards on the HONEST blind slice (the authoritative gate) ──────
// Floors just under the measured baseline; the build fails if a change regresses
// generalization on real, diverse data.
const GUARDS = { blindAucMin: 0.85, blindRecallMin: 0.78, blindSpecMin: 0.68, oodAucMin: 0.85 };
const fails: string[] = [];
if (blind.auc < GUARDS.blindAucMin) fails.push(`blind AUC ${blind.auc.toFixed(3)} < ${GUARDS.blindAucMin}`);
if (blind.r < GUARDS.blindRecallMin) fails.push(`blind recall ${blind.r.toFixed(3)} < ${GUARDS.blindRecallMin}`);
if (blind.spec < GUARDS.blindSpecMin) fails.push(`blind specificity ${blind.spec.toFixed(3)} < ${GUARDS.blindSpecMin}`);
if (oodY.length && oodR.auc < GUARDS.oodAucMin) fails.push(`OOD AUC ${oodR.auc.toFixed(3)} < ${GUARDS.oodAucMin}`);
console.log(`\n${'═'.repeat(58)}`);
if (fails.length) {
  console.log('  ✗ GUARDS FAIL');
  for (const f of fails) console.log(`      · ${f}`);
  process.exit(1);
}
console.log('  ✓ GUARDS PASS — generalization holds on diverse data.');
