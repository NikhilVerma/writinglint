/**
 * Orchestrates the rules, dedups overlapping findings, and scores the text.
 */
import { buildContext, type Parser } from './tokens.js';
import { CATEGORY_WEIGHT, RULES } from './rules.js';
import { structuralFindings } from './structural.js';
import { docFeatures } from './features.js';
import { predict, type Model } from './classifier.js';
import {
  CATEGORY_ORDER,
  type Analysis,
  type Category,
  type Context,
  type Finding,
} from './types.js';

/** Build the parse context and the deduped, sorted findings (for feature extraction). */
export async function analyzeContext(
  text: string,
  parser: Parser,
): Promise<{ ctx: Context; findings: Finding[] }> {
  const ctx = await buildContext(text, parser);
  const findings = dedupe([
    ...RULES.flatMap((rule) => rule(ctx)),
    ...structuralFindings(ctx),
  ]).sort((a, b) => a.start - b.start || b.end - a.end);
  return { ctx, findings };
}

const PRIORITY = new Map<Category, number>(CATEGORY_ORDER.map((c, i) => [c, i]));

function emptyCounts(): Record<Category, number> {
  return {
    'ai-vocab': 0,
    significance: 0,
    promo: 0,
    parallelism: 0,
    'rule-of-three': 0,
    vague: 0,
    conjunctions: 0,
    meta: 0,
    formatting: 0,
  };
}

/** Drop exact-duplicate spans within a category (rules can double-hit). */
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    const key = `${f.category}:${f.start}:${f.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// Verdict bands over the classifier probability (×100). The detector measures
// AI-shaped *style* (hollowness / generic rhythm), NOT authorship — tight,
// specific writing scores low whoever wrote it — so the labels describe how the
// prose reads, not who produced it.
const VERDICTS: { max: number; label: string }[] = [
  { max: 20, label: 'Reads clean' },
  { max: 45, label: 'Mostly clean' },
  { max: 60, label: 'Some AI-style' },
  { max: 80, label: 'Noticeably AI-styled' },
  { max: 101, label: 'Reads AI-styled' },
];

function verdictFor(score: number): string {
  return (VERDICTS.find((v) => score < v.max) ?? VERDICTS[VERDICTS.length - 1]).label;
}

/**
 * Analyse a block of text and return findings + stats.
 *
 * Requires a loaded nlpgraph parser (the structural rules judge writing from the
 * dependency graph). Pass the trained `model` to make the score the calibrated
 * classifier probability (the SOTA detector); without it, the score falls back
 * to a heuristic tell-density. The findings/highlights are identical either way.
 */
export async function analyze(text: string, parser: Parser, model?: Model): Promise<Analysis> {
  const { ctx, findings: raw } = await analyzeContext(text, parser);

  const counts = emptyCounts();
  let weighted = 0;
  for (const f of raw) {
    counts[f.category]++;
    weighted += CATEGORY_WEIGHT(f.category);
  }

  const words = ctx.tokens.length;
  const sentences = ctx.sentences.length;

  let score: number;
  if (model) {
    // Calibrated classifier probability → 0–100. The SOTA detector.
    score = Math.round(predict(model, docFeatures(ctx, raw)) * 100);
  } else {
    // Fallback: weighted tells per 100 words, squashed onto 0–100.
    const perHundred = words > 0 ? (weighted / words) * 100 : 0;
    score = Math.min(100, Math.round(perHundred * 6));
  }

  return {
    findings: raw,
    counts,
    stats: {
      words,
      sentences,
      characters: text.length,
      density: words > 0 ? +(raw.length / (words / 100)).toFixed(1) : 0,
      score,
      verdict: verdictFor(score),
    },
  };
}

/** A non-overlapping slice of text for rendering: either plain or a single finding. */
export interface Segment {
  start: number;
  end: number;
  finding?: Finding;
}

/**
 * Flatten possibly-overlapping findings into non-overlapping segments, so the
 * UI can wrap each in exactly one <mark>. Higher-priority categories win a
 * contested character.
 */
export function segments(text: string, findings: Finding[]): Segment[] {
  if (findings.length === 0) return [{ start: 0, end: text.length }];

  // Winner-per-character via priority, then coalesce equal runs.
  const owner: (Finding | undefined)[] = new Array(text.length);
  for (const f of findings) {
    const p = PRIORITY.get(f.category) ?? 99;
    for (let i = f.start; i < f.end && i < text.length; i++) {
      const cur = owner[i];
      if (!cur || (PRIORITY.get(cur.category) ?? 99) > p) owner[i] = f;
    }
  }

  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const f = owner[i];
    let j = i + 1;
    while (j < text.length && owner[j] === f) j++;
    out.push(f ? { start: i, end: j, finding: f } : { start: i, end: j });
    i = j;
  }
  return out;
}
