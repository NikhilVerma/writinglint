import assert from 'node:assert/strict';
import test from 'node:test';

import { countByLevel, isScoredRule, weighFindings, weightFor } from '../src/lib/findings.ts';
import { loadConfig } from '../src/lib/env.ts';

const weights = { error: 1, warn: 1, info: 0.4 };

test('info findings carry weight instead of being discarded', () => {
  // The bug this replaces: info was filtered out before counting, so the model
  // was never paid to remove an info-level habit.
  assert.equal(weightFor('info', weights), 0.4);
  assert.ok(weightFor('info', weights) > 0);
});

test('slopsift spells the middle level "warn", and "warning" means the same', () => {
  assert.equal(weightFor('warn', weights), 1);
  assert.equal(weightFor('warning', weights), 1);
});

test('an unknown level counts for nothing rather than throwing', () => {
  assert.equal(weightFor('debug', weights), 0);
});

test('a mixed document is priced by level', () => {
  const findings = [
    { level: 'error' },
    { level: 'warn' },
    { level: 'warn' },
    { level: 'info' },
    { level: 'info' },
  ];
  assert.equal(weighFindings(findings, weights), 3 + 0.8);
  assert.deepEqual(countByLevel(findings), { error: 1, warn: 2, info: 2 });
});

test('ten info findings cost less than four paid ones', () => {
  const info = weighFindings(Array.from({ length: 10 }, () => ({ level: 'info' })), weights);
  const paid = weighFindings(Array.from({ length: 4 }, () => ({ level: 'warn' })), weights);
  assert.ok(info < paid, `info ${info} should cost less than paid ${paid}`);
});

test('the shipped config prices info below the paid levels but above zero', () => {
  const { levelWeights } = loadConfig().reward;
  assert.ok(levelWeights.info > 0, 'info must count for something');
  assert.ok(levelWeights.info < levelWeights.warn, 'info must cost less than a warning');
});

test('the human band stays calibrated against what actually feeds it', () => {
  // Each band is p10 and p75 of untouched human originals in weighted findings
  // per 1k, measured in its own domain. Three things move those percentiles:
  // the level weights, the rules being priced, and the corpus. Change any of
  // them without re-measuring and the target silently drifts.
  //
  // This has already bitten twice. Narrowing scoredRules to ai-style plus
  // aside-pileup dropped the human median from 31.7 to 12.5 per 1k, so the old
  // [17, 36] would have put most human writing BELOW its own floor. And the
  // resulting [7, 15] was then enforced on pull-request descriptions and
  // release notes, which sit at a median of 16.4 in the same units, so the
  // reward called ordinary human technical writing slop.
  const { levelWeights, domains, scoredRules } = loadConfig().reward;
  assert.equal(levelWeights.info, 0.4, 'weights changed; re-measure both bands');
  assert.deepEqual(scoredRules, ['ai-style', 'reader-first/aside-pileup'], 'rule set changed; re-measure both bands');
  assert.deepEqual(domains.prose.band, [7, 15]);
  assert.deepEqual(domains.technical.band, [2.5, 16.8]);
});

test('each band brackets where its own measured human prose actually sits', () => {
  // Median human writing is 11.6 weighted findings per 1k over 250 blog-essay
  // originals under the priced rule set, and 10.3 over 561 pull requests merged
  // between 2018 and 2019. A band that excluded its own median would train the
  // model away from the writing it is meant to imitate.
  //
  // The technical figure used to be 16.4, measured on CURRENT pull requests, and
  // that number was contamination rather than a property of technical writing.
  // 24 of those 639 documents say "Generated with [Claude Code]" in the body, 12
  // name Copilot, and 48 carry GitHub's generative-AI disclosure prompt; the
  // undeclared share is unknowable. Re-measured on prose merged before GPT-3
  // existed, every percentile drops: p50 19.6 to 10.3, p75 29.3 to 16.8. The
  // reward had been telling the model that 23 findings per 1k was human.
  const { domains } = loadConfig().reward;
  const [pLow, pHigh] = domains.prose.band;
  assert.ok(pLow < 11.6 && pHigh > 11.6, 'the essay median must fall inside the prose band');
  const [tLow, tHigh] = domains.technical.band;
  assert.ok(tLow < 10.3 && tHigh > 10.3, 'the technical median must fall inside the technical band');
  // The two bands stay distinct because technical prose varies more, not
  // because it is sloppier. Its median now sits BELOW the essay median.
  assert.ok(tLow < pLow && tHigh > pHigh, 'the technical band is wider at both ends');
});

test('the echo floors match what a legitimate rewrite in each domain echoes', () => {
  // Measured over 300 essay pairs and 375 technical pairs: an essay rewrite
  // keeps a median 0.11 of its source 4-grams, a technical rewrite 0.74,
  // because names and numbers have to survive. A single floor of 0.35 was
  // wrong in both directions at once — it paid an essay rewrite full marks for
  // doing half the work, and charged a faithful technical rewrite 60% of its
  // credit.
  const { domains } = loadConfig().reward;
  assert.ok(domains.prose.echoFloor > 0.11, 'a median essay rewrite must clear the prose floor');
  assert.ok(domains.prose.echoFloor < 0.35, 'the prose floor must be tighter than the old shared one');
  assert.ok(domains.technical.echoFloor > 0.35, 'a faithful technical rewrite must not be charged for keeping names');
  assert.ok(domains.technical.echoFloor < 1, 'a verbatim technical copy must still reach zero');
});

test('the reward prices only its own rule set', () => {
  const weights = { error: 1, warn: 1, info: 0.4 };
  const findings = [
    { ruleId: 'ai-style/absolute-claim', level: 'warn' },
    { ruleId: 'reader-first/sentence-load', level: 'warn' },
    { ruleId: 'reader-first/aside-pileup', level: 'info' },
  ];
  // Empty list means score everything, which is what reporting callers want.
  assert.equal(weighFindings(findings, weights), 2.4);
  // The reward's set: a whole pack by name, plus one rule lifted out of another.
  assert.equal(weighFindings(findings, weights, ['ai-style', 'reader-first/aside-pileup']), 1.4);
  assert.equal(isScoredRule('ai-style/rule-of-three', ['ai-style']), true, 'a pack name covers its rules');
  assert.equal(isScoredRule('reader-first/sentence-load', ['ai-style', 'reader-first/aside-pileup']), false);
  assert.equal(isScoredRule(undefined, ['ai-style']), true, 'an unnamed finding is not silently dropped');
});
