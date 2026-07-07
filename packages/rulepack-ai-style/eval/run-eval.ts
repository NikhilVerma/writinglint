/**
 * WritingLint — INTERPRETABLE detector view (score distributions, per-category
 * firing, false-positive phrase triage).
 *
 * NOTE: the AUTHORITATIVE, guarded metrics come from `npm run train`, which does
 * the honest disjoint train/blind-test split over the diverse real pool. This
 * harness re-scores the SAVED model over the labelled sets for inspection — the
 * benchmark/heldout docs are partly in the training distribution now, so treat
 * these numbers as diagnostic (optimistic), NOT as the generalization number.
 *
 * Run: npm run eval   (after `npm run train`)
 */
import {
  auc,
  confusionAt,
  loadSplit,
  mean,
  quantile,
  ruleCounts,
  score,
  topPhrases,
  type Scored,
} from './lib.js';

/**
 * Operating threshold for the trained classifier: predict "AI" iff score ≥ 49
 * (best-F1 on the training pool). The score is now the calibrated classifier
 * probability ×100, so this boundary is meaningful and stable.
 */
const OPERATING_THRESHOLD = 49;

/**
 * Regression guards — floors just under the honest classifier baseline (blind
 * held-out: AUC 0.997, specificity 1.00, recall 0.89, human-mean ~3). The build
 * fails if a change regresses below them. SPECIFICITY stays paramount — falsely
 * telling a human their writing is hollow is the costly error.
 */
const GUARDS = {
  humanMeanScoreMax: 22, // avg human doc must read clearly human
  specificityMin: 0.9, // ≥90% of human docs must NOT be flagged
  recallMin: 0.75, // the classifier catches subtle AI the rules miss
  aucMin: 0.9, // strong separation
};

const bar = (n: number) => '█'.repeat(Math.round(n)) + '░'.repeat(Math.max(0, 20 - Math.round(n)));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(1);

function scoreLine(label: string, docs: Scored[]): void {
  if (!docs.length) {
    console.log(`  ${label.padEnd(8)}  (no docs)`);
    return;
  }
  const scores = docs.map((d) => d.score);
  console.log(
    `  ${label.padEnd(8)}  n=${String(docs.length).padStart(3)}  ` +
      `mean ${f2(mean(scores)).padStart(5)}  median ${f2(quantile(scores, 0.5)).padStart(5)}  ` +
      `p90 ${f2(quantile(scores, 0.9)).padStart(5)}  max ${f2(Math.max(...scores)).padStart(5)}`,
  );
}

function reportSplit(
  name: string,
  human: Scored[],
  ai: Scored[],
  threshold: number,
  blind = false,
): { ok: boolean; notes: string[] } {
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  ${name}`);
  console.log('═'.repeat(64));

  if (!human.length && !ai.length) {
    console.log('  (no data — see eval/data/README.md)');
    return { ok: true, notes: ['skipped (no data)'] };
  }

  console.log('\n  Score distribution (0 = reads human, 100 = reads machine):');
  scoreLine('human', human);
  scoreLine('ai', ai);

  const a = auc(human, ai);
  const c = confusionAt(human, ai, threshold);
  const humanMean = mean(human.map((d) => d.score));

  console.log(`\n  Separation AUC: ${a.toFixed(3)}  ${bar(a * 20)}`);
  console.log(`  @ threshold ${threshold} (predict "AI" iff score ≥ ${threshold}):`);
  console.log(
    `    recall(AI) ${pct(c.recall).padStart(6)}   specificity(human) ${pct(c.specificity).padStart(6)}   ` +
      `precision ${pct(c.precision).padStart(6)}   F1 ${c.f1.toFixed(3)}`,
  );
  console.log(`    confusion: TP ${c.tp}  FP ${c.fp}  TN ${c.tn}  FN ${c.fn}`);

  // For HELD-OUT we deliberately DON'T print per-doc failures, per-rule sources,
  // or the exact phrases that trip — inspecting those to fix rules would be
  // tuning against the blind set. Aggregate numbers only. (dev prints detail.)
  if (blind) {
    console.log('\n  (blind set — per-doc detail suppressed to keep it honest)');
  } else {
    const fpDocs = human.filter((d) => d.score >= threshold);
    if (fpDocs.length) {
      console.log(`\n  ⚠ Human docs FLAGGED as AI (false positives):`);
      for (const d of fpDocs)
        console.log(`      ${d.score.toString().padStart(3)}  ${d.id}`);
    }
    const fnDocs = ai.filter((d) => d.score < threshold);
    if (fnDocs.length) {
      console.log(`\n  ○ AI docs MISSED (false negatives):`);
      for (const d of fnDocs)
        console.log(`      ${d.score.toString().padStart(3)}  ${d.id}`);
    }
    if (human.length) {
      const rc = [...ruleCounts(human).entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
      if (rc.length) {
        console.log(`\n  Top rules firing on HUMAN text (false-positive sources):`);
        for (const [rule, n] of rc) console.log(`      ${String(n).padStart(4)}  ${rule}`);
        console.log(`  Most-flagged human phrases:`);
        for (const [p, n] of topPhrases(human, 10)) console.log(`      ${String(n).padStart(4)}  “${p}”`);
      }
    }
  }

  const notes: string[] = [];
  let ok = true;
  if (humanMean > GUARDS.humanMeanScoreMax) {
    ok = false;
    notes.push(`human mean ${f2(humanMean)} > ${GUARDS.humanMeanScoreMax}`);
  }
  if (c.specificity < GUARDS.specificityMin) {
    ok = false;
    notes.push(`specificity ${pct(c.specificity)} < ${pct(GUARDS.specificityMin)}`);
  }
  if (ai.length && c.recall < GUARDS.recallMin) {
    ok = false;
    notes.push(`recall ${pct(c.recall)} < ${pct(GUARDS.recallMin)}`);
  }
  if (a < GUARDS.aucMin) {
    ok = false;
    notes.push(`AUC ${a.toFixed(3)} < ${GUARDS.aucMin}`);
  }
  return { ok, notes };
}

// ── main ────────────────────────────────────────────────────────────────────
// The classifier is trained by `npm run train` (on the closed corpus). This
// harness scores the trained model on two labelled sets for inspection:
//   HELD-OUT  — the narrower held-out split.
//   BENCHMARK — the broader, more varied set.
const held = loadSplit('heldout');
const bench = loadSplit('benchmark');

const heldHuman = await score(held.human);
const heldAi = await score(held.ai);
const benchHuman = await score(bench.human);
const benchAi = await score(bench.ai);

if (!heldHuman.length && !benchHuman.length) {
  console.log(
    '\nNo eval data found under eval/data/ (it is closed-source & gitignored).\n' +
      'See eval/data/README.md. Run `npm run train` first to fit models/classifier.json.\n',
  );
  process.exit(0);
}

const threshold = OPERATING_THRESHOLD;
console.log(`\nOperating threshold: ${threshold} (classifier probability ×100)`);
console.log('(diagnostic view — authoritative guarded metrics: `npm run train`)');

if (benchHuman.length)
  reportSplit('BENCHMARK  (broader varied set — diagnostic)', benchHuman, benchAi, threshold);
reportSplit('OOD HELD-OUT  (narrower held-out split — diagnostic)', heldHuman, heldAi, threshold);
