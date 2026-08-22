import assert from 'node:assert/strict';
import test from 'node:test';

import { countByLevel, weighFindings, weightFor } from '../src/lib/findings.ts';
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

test('the human band stays calibrated against the level weights', () => {
  // The band is p10 and p75 of 1,221 untouched human originals, measured in
  // weighted findings per 1k. Change the weights and those percentiles move,
  // so the band has to be re-measured or the target silently drifts.
  const { levelWeights, humanBand } = loadConfig().reward;
  assert.equal(levelWeights.info, 0.4, 'weights changed; re-measure the human band');
  assert.deepEqual(humanBand, [17, 36]);
});

test('the band brackets where measured human prose actually sits', () => {
  // Median human writing is 30.8 weighted findings per 1k. A band that excluded
  // it would train the model away from the writing it is meant to imitate.
  const [low, high] = loadConfig().reward.humanBand;
  assert.ok(low < 30.8 && high > 30.8, 'the human median must fall inside the band');
});
