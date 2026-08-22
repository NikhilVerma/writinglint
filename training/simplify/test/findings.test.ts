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
  // The band is p10 and p75 of untouched human originals in weighted findings
  // per 1k. Three things move those percentiles: the level weights, the rules
  // being priced, and the corpus. Change any of them without re-measuring and
  // the target silently drifts.
  //
  // This has already bitten once. Narrowing scoredRules to ai-style plus
  // aside-pileup dropped the human median from 31.7 to 12.5 per 1k, so the old
  // [17, 36] would have put most human writing BELOW its own floor and paid
  // the model to add findings back.
  const { levelWeights, humanBand, scoredRules } = loadConfig().reward;
  assert.equal(levelWeights.info, 0.4, 'weights changed; re-measure the human band');
  assert.deepEqual(scoredRules, ['ai-style', 'reader-first/aside-pileup'], 'rule set changed; re-measure the human band');
  assert.deepEqual(humanBand, [7, 15]);
});

test('the band brackets where measured human prose actually sits', () => {
  // Median human writing is 12.5 weighted findings per 1k over 250 originals
  // under the priced rule set. A band that excluded it would train the model
  // away from the writing it is meant to imitate.
  const [low, high] = loadConfig().reward.humanBand;
  assert.ok(low < 12.5 && high > 12.5, 'the human median must fall inside the band');
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
