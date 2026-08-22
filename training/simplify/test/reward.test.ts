import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/lib/env.ts';
import { scoreRewrite } from '../src/lib/reward.ts';

const config = loadConfig().reward;

// Excerpt of a real pull-request description — the input that exposed the
// copying, not text written for this test.
const SOURCE = [
  'An `xref` on a framework statement CLAIMS byte-identity with a source statement at a pinned commit.',
  'API offline **4146 pass / 0 fail**; L2 **225/225** (two specs, `--repeat-each=15`).',
  'Mutation-verified: 6 fixes, each mutation made the intended test fail.',
  'Reviewed by a Codex peer (verdict REVISE — 5 findings) and CodeRabbit (11 findings).',
].join('\n\n');

const score = (output: string, outputFindings: number, sourceFindings = 8) =>
  scoreRewrite({ source: SOURCE, output, sourceFindings, outputFindings, config });

test('a verbatim copy earns almost nothing despite perfect faithfulness', () => {
  const result = score(SOURCE, 8);
  assert.equal(result.faithfulness, 1);
  assert.equal(result.length, 1);
  assert.ok(result.reward < 0.05, `reward was ${result.reward}`);
});

test('a rewrite that keeps its anchors and cuts findings scores well', () => {
  const rewrite = [
    'An `xref` on a framework statement claims byte-identity with a source statement at a pinned commit.',
    'The offline API run records 4146 pass and 0 fail. L2 records 225/225 over two specs, run with `--repeat-each=15`.',
    'Six fixes are mutation-verified. Every mutation failed the test it was meant to fail.',
    'A Codex peer reviewed it and returned REVISE with 5 findings. CodeRabbit returned 11 findings.',
  ].join('\n\n');
  const result = score(rewrite, 2);
  assert.equal(result.droppedAnchors.length, 0, `dropped: ${result.droppedAnchors.join(', ')}`);
  assert.ok(result.echoRate < 0.5);
  assert.ok(result.reward > 0.6, `reward was ${result.reward}`);
});

test('dropping and inventing facts sinks the score even when the lint is clean', () => {
  const confabulated = [
    'The API is offline at this time, so the suite could not run.',
    'A reviewer looked over the change and asked for revisions.',
    'Several fixes landed and the tests now pass on the 9271 build.',
    'The team expects to merge it once the remaining questions are settled.',
  ].join('\n\n');
  // Half a weighted finding on a 52-word sample is 10 per 1k, which sits inside
  // the human band, so the lint term is perfect and the reward still has to
  // sink on the faithfulness gate alone. Weighted counts are fractional by
  // construction: a single info finding is worth 0.4.
  const result = score(confabulated, 0.5);
  assert.equal(result.lint, 1, 'lint term should be perfect');
  assert.ok(result.anchorKeptRate < 0.4, `keptRate was ${result.anchorKeptRate}`);
  assert.ok(result.reward < 0.45, `reward was ${result.reward}`);
});

test('a repetition loop scores exactly zero', () => {
  const looped = `${'The pointer moves forward along the commit graph. '.repeat(40)}`;
  const result = score(looped, 0);
  assert.equal(result.degenerate, 'repetition loop');
  assert.equal(result.reward, 0);
});

test('a two-line summary is rejected as too short', () => {
  const result = score('The change makes an xref claim hold on the write path.', 0);
  assert.equal(result.degenerate, 'too short');
  assert.equal(result.reward, 0);
});

test('an already clean source earns the lint term by landing in the band, not by scrubbing', () => {
  const rewrite = SOURCE.replace('CLAIMS', 'claims');
  // 52 words, so half a weighted finding is 10 per 1k and a whole one is 19.
  // The first sits inside the band and the second above it.
  assert.equal(score(rewrite, 0.5, 0.5).lint, 1, 'staying inside the band is full marks');
  assert.ok(score(rewrite, 1, 0.5).lint < 1, 'drifting above the band costs');
  // Scrubbing every finding out of a clean source now scores below holding it
  // steady. That is the whole point: v7 wrote at half the human density
  // because the old term paid all the way to zero.
  assert.ok(score(rewrite, 0, 0.5).lint < score(rewrite, 0.5, 0.5).lint, 'over-editing must not outscore leaving it alone');
});

// The pull-request excerpt above is 52 words, so one finding there is already
// 19 per 1k — the whole clean band the floor exists for cannot be expressed on
// it. These tests measure the lint term alone, so they use a longer piece of
// this project's own README instead, where a finding is worth ~6 per 1k.
const PROSE = [
  'WritingLint is the reusable engine. It parses text once, runs rulepacks over a dependency graph and document structure, and returns exact source ranges with plain-language diagnostics. Rules can inspect tokens, parts of speech, dependency relations, sentences, paragraphs, and whole documents.',
  'The independent `reader-first` pack borrows general simplified-technical-writing techniques: introduce terms, show relationships, keep the main point visible, and remove ornament. It does not ship an external controlled dictionary or claim compliance with an external standard.',
  'WritingLint owns reusable parsing, configuration, rule execution, graph helpers, and rulepacks. It can support house style, personal preferences, grammar, clarity, or any other prose policy a team can encode.',
  'SlopSift owns the narrower AI-slop experience: file discovery, prose/comment extraction, confidence defaults, ESLint-like output, JSON contracts, and product ergonomics. It consumes WritingLint rather than existing as a mode inside the general WritingLint CLI.',
  'Extracted ranges are mapped back to original UTF-16 source locations so CLI and editor diagnostics point to the right text.',
].join('\n\n');

const PROSE_WORDS = PROSE.split(/\s+/).filter(Boolean).length;
// Not rounded. Weighted counts are fractional by construction, and rounding to
// whole findings on a sample this short cannot express a one-per-1k difference.
const findingsFor = (per1k: number) => (per1k * PROSE_WORDS) / 1000;

/** Source and output are the same text, so both densities convert the same way
 * and the test can state the findings per 1k words it actually means. */
const lintAt = (sourcePer1k: number, outputPer1k: number) =>
  scoreRewrite({
    source: PROSE,
    output: PROSE,
    sourceFindings: findingsFor(sourcePer1k),
    outputFindings: findingsFor(outputPer1k),
    config,
  }).lint;

test('prose already inside the human band scores full marks for being left alone', () => {
  // The point of the band. Measured human writing sits at 30.8 weighted
  // findings per 1k, so a rewrite landing at 25 is done. Paying more for going
  // lower is what trained v7 to write twice as clean as Paul Graham, and it is
  // why pasting simplified text back in produced another round of churn.
  assert.equal(lintAt(12, 12), 1, 'holding inside the band is finished work');
  assert.equal(lintAt(12, 8), 1, 'no extra credit for cleaning past the band');
  assert.equal(lintAt(30, 12), 1, 'reaching the band from above is full marks');
});

test('scrubbing past the human floor costs', () => {
  // Prose cleaner than 90% of Hemingway has had something taken out of it.
  // The taper is gentle on purpose: being clean is not a crime, it just stops
  // being worth more.
  assert.ok(lintAt(20, 3) < lintAt(20, 9), 'over-editing should score below the band');
  assert.ok(lintAt(20, 0) > 0.4, 'the taper must not zero the term');
  assert.ok(lintAt(20, 0) < lintAt(20, 4), 'the taper is monotonic');
});

test('adding findings to decent prose still costs', () => {
  assert.ok(lintAt(12, 30) < lintAt(12, 12), 'making clean prose worse must cost');
});

test('a dirty source is still scored on how much it cut', () => {
  // Above the band nothing changed in spirit: credit tracks the distance
  // closed. The target is the top of the band rather than zero.
  assert.ok(lintAt(34, 34) < 0.05, 'no cut earns nothing');
  assert.ok(lintAt(34, 20) > 0.6, 'closing most of the gap earns most of the term');
  assert.ok(lintAt(34, 25) < lintAt(34, 20), 'a smaller cut earns less');
});

test('a source barely above the band still has a gradient to climb', () => {
  // Without lintSpan this was all-or-nothing across a one-finding gap.
  const held = lintAt(16, 16);
  assert.ok(held > 0.05 && held < 1, `expected a partial score, got ${held}`);
  assert.ok(lintAt(16, 15) > held, 'reaching the band must pay more than missing it');
});

test('reordered words are caught as a shuffle, not paid as a rewrite', () => {
  // Word salad keeps every anchor, echoes no phrase, and holds the source's
  // length, so it outscored a real rewrite before this check existed.
  const shuffled = SOURCE.split(/\s+/).reverse().join(' ');
  const result = score(shuffled, 4);
  assert.equal(result.faithfulness, 1, 'a shuffle keeps every anchor');
  assert.ok(result.echoRate < 0.05);
  assert.ok(result.vocabularyOverlap > 0.9);
  assert.equal(result.degenerate, 'shuffled');
  assert.equal(result.reward, 0);
});

test('a real rewrite is not mistaken for a shuffle', () => {
  const rewrite = [
    'An `xref` on a framework statement claims byte-identity with a source statement at a pinned commit.',
    'The offline API run records 4146 pass and 0 fail. L2 records 225/225 over two specs, run with `--repeat-each=15`.',
    'Six fixes are mutation-verified. Every mutation failed the test it was meant to fail.',
    'A Codex peer reviewed it and returned REVISE with 5 findings. CodeRabbit returned 11 findings.',
  ].join('\n\n');
  const result = score(rewrite, 2);
  assert.equal(result.degenerate, null);
  assert.ok(result.echoRate > 0.05, `echo was ${result.echoRate}`);
});

test('handing back a source that is already clean is not punished as a copy', () => {
  // The point of the human band: when the source needs no work, returning it
  // is the correct move and the echo gate must not zero it.
  const words = SOURCE.split(/\s+/).filter((w) => w !== '').length;
  const clean = (10 * words) / 1000; // 10 per 1k, inside the band
  const result = score(SOURCE, clean, clean);
  assert.equal(result.echo, 1, 'the gate must not fire on a source that needs no work');
  assert.ok(result.reward > 0.5, `returning clean prose scored ${result.reward}`);
});

test('a dirty source still cannot be copied out of the work', () => {
  const words = SOURCE.split(/\s+/).filter((w) => w !== '').length;
  const dirty = (80 * words) / 1000;
  const result = score(SOURCE, dirty, dirty);
  assert.equal(result.reward, 0, 'a verbatim copy of dirty text must still score zero');
});

test('a source already below the band is not asked to fatten itself back up', () => {
  // This is what makes the model's own output safe to use as a prompt. Its
  // outputs land under the band, and the only way to raise findings per 1k is
  // to put slop back in. Holding steady has to be the top score.
  assert.equal(lintAt(4, 4), 1, 'holding thin prose steady is full marks');
  assert.equal(lintAt(4, 7), lintAt(4, 4), 'adding findings must earn nothing extra');
  assert.ok(lintAt(4, 2) < lintAt(4, 4), 'cutting further still costs');
});

test('holding finished text steady outscores rewriting it', () => {
  // The fixed point, priced. Scoring v7's own outputs against themselves, a
  // copy and an 11%-churned rewrite came out at the same reward on most
  // documents, so a GRPO group over finished text had no advantage to learn
  // from. Preservation has to win outright, or the run teaches nothing.
  const words = SOURCE.split(/\s+/).filter((w) => w !== '').length;
  const clean = (10 * words) / 1000;
  const copy = score(SOURCE, clean, clean);
  const churned = score(SOURCE.replace('CLAIMS', 'asserts a claim of').replace('Mutation-verified:', 'We mutation-verified'), clean, clean);
  assert.ok(churned.echoRate < 1, 'the churned version must actually differ');
  assert.ok(copy.reward > churned.reward, `copy ${copy.reward} vs churn ${churned.reward}`);
});
