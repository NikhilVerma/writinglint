/**
 * Eval library — data loading + metric helpers, shared by the harness.
 *
 * OPEN SOURCE (this file). The DATA it loads is CLOSED SOURCE and gitignored
 * (repo-root eval/data/, third-party text kept private). If the data dir is
 * absent, the harness degrades gracefully with a pointer to its README.
 *
 * Layout expected under eval/data/:
 *   <split>/human/*.txt   — human writing (should score LOW)
 *   <split>/ai/*.txt      — AI / AI-styled text (should score HIGH)
 * where <split> is `corpus`, `benchmark`, or `heldout`.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter, resolveConfig, type Lint } from '@better-write/core';
import { loadParser } from '@better-write/parser-node';
import { recommended, score as scoreDoc, type Model } from '../src/index.js';
import { loadModelNode } from '../src/score/model-node.js';

/** Load the trained classifier (data-free JSON), or undefined if not built yet. */
export function loadModel(): Model | undefined {
  return loadModelNode();
}

// Closed-source eval data lives at the repo root (gitignored, never committed),
// not inside the package — from packages/rulepack-ai-style/eval/ that is ../../../.
export const DATA_DIR = fileURLToPath(new URL('../../../eval/data/', import.meta.url));

export type Label = 'human' | 'ai';
export type Split = 'dev' | 'heldout' | 'corpus' | 'benchmark';

export interface Doc {
  id: string;
  split: Split;
  label: Label;
  text: string;
}

export interface Scored extends Doc {
  score: number;
  lints: Lint[];
}

/** Load every .txt doc for a split/label, or [] if the dir is absent. */
export function loadDocs(split: Split, label: Label): Doc[] {
  const dir = join(DATA_DIR, split, label);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => ({
      id: `${split}/${label}/${basename(f)}`,
      split,
      label,
      text: readFileSync(join(dir, f), 'utf8'),
    }));
}

export function loadSplit(split: Split): { human: Doc[]; ai: Doc[] } {
  return { human: loadDocs(split, 'human'), ai: loadDocs(split, 'ai') };
}

export async function score(docs: Doc[]): Promise<Scored[]> {
  const parser = await loadParser();
  const linter = new Linter(parser);
  const config = resolveConfig(recommended);
  const model = loadModel();
  const out: Scored[] = [];
  for (const d of docs) {
    const { doc, lints } = await linter.lint(d.text, config);
    out.push({ ...d, score: scoreDoc(doc, lints, model).score, lints });
  }
  return out;
}

// ── stats helpers ───────────────────────────────────────────────────────────

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Confusion matrix at a score threshold: predict "ai" iff score >= threshold.
 * Positive class = ai.
 */
export interface Confusion {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
  accuracy: number;
}

export function confusionAt(human: Scored[], ai: Scored[], threshold: number): Confusion {
  const fp = human.filter((d) => d.score >= threshold).length;
  const tn = human.length - fp;
  const tp = ai.filter((d) => d.score >= threshold).length;
  const fn = ai.length - tp;
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const specificity = tn + fp ? tn / (tn + fp) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / Math.max(1, human.length + ai.length);
  return { threshold, tp, fp, tn, fn, precision, recall, specificity, f1, accuracy };
}

/** Sweep thresholds and return the confusion at each. */
export function sweep(human: Scored[], ai: Scored[], step = 2): Confusion[] {
  const out: Confusion[] = [];
  for (let t = 0; t <= 100; t += step) out.push(confusionAt(human, ai, t));
  return out;
}

/**
 * ROC AUC via the rank statistic (Mann–Whitney U) — the probability a random
 * AI doc scores above a random human doc. 1.0 = perfect separation, 0.5 = none.
 */
export function auc(human: Scored[], ai: Scored[]): number {
  if (!human.length || !ai.length) return 0;
  let wins = 0;
  for (const a of ai)
    for (const h of human) {
      const da = a.score;
      const dh = h.score;
      wins += da > dh ? 1 : da === dh ? 0.5 : 0;
    }
  return wins / (human.length * ai.length);
}

/** Aggregate per-rule firing counts across a set of scored docs (by ruleId). */
export function ruleCounts(docs: Scored[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) for (const l of d.lints) m.set(l.ruleId, (m.get(l.ruleId) ?? 0) + 1);
  return m;
}

/** Aggregate per-category firing counts. */
export function categoryCounts(docs: Scored[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) for (const l of d.lints) m.set(l.category, (m.get(l.category) ?? 0) + 1);
  return m;
}

/** The exact phrases a rule set most often flags (for false-positive triage). */
export function topPhrases(docs: Scored[], limit = 15): [string, number][] {
  const m = new Map<string, number>();
  for (const d of docs)
    for (const l of d.lints) {
      const key = l.text.toLowerCase().replace(/\s+/g, ' ').trim();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
