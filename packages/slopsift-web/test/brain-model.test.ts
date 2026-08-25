import assert from 'node:assert/strict';
import test from 'node:test';
import { pressureForMoment, pressureStatus } from '../src/client/brain-model.js';
import type { CognitiveMoment } from '../src/client/worker.js';

const moment = (overrides: Partial<CognitiveMoment> = {}): CognitiveMoment => ({
  sentence: 0,
  start: 0,
  end: 10,
  text: 'A sentence.',
  introducedEntities: [],
  releasedEntities: [],
  newRelationships: 0,
  releasedRelationships: 0,
  activeEntities: [],
  activeRelationships: [],
  activeIdeas: [],
  activeDecisionStandards: [],
  roleChanges: 0,
  pushes: 0,
  pops: 0,
  reactivations: 0,
  netInflow: 0,
  headingBoundaryBefore: false,
  consolidationCues: [],
  ...overrides,
});

test('brain pressures use the reader-first rule thresholds as capacities', () => {
  const pressures = pressureForMoment(moment({
    activeEntities: Array.from({ length: 6 }, (_, index) => `concept-${index}`),
    activeRelationships: Array.from({ length: 6 }, (_, index) => `relationship-${index}`),
    activeIdeas: ['one', 'two', 'three'],
    activeDecisionStandards: ['relevant', 'material', 'sufficient', 'appropriate'],
    roleChanges: 2,
    reactivations: 1,
  }));
  assert.deepEqual(pressures.map(({ value, capacity, pressure }) => ({ value, capacity, pressure })), [
    { value: 6, capacity: 12, pressure: 0.5 },
    { value: 6, capacity: 6, pressure: 1 },
    { value: 3, capacity: 3, pressure: 1 },
    { value: 4, capacity: 4, pressure: 1 },
    { value: 3, capacity: 3, pressure: 1 },
  ]);
  assert.equal(pressureStatus(pressures), 'overloaded');
});

test('visual pressure is capped while status still notices a capacity crossing', () => {
  const pressures = pressureForMoment(moment({ activeEntities: Array.from({ length: 18 }, (_, index) => `concept-${index}`) }));
  assert.equal(pressures[0]?.pressure, 1);
  assert.equal(pressures[0]?.value, 18);
  assert.equal(pressureStatus(pressures), 'overloaded');
});
