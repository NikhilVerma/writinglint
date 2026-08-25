import type { CognitiveMoment } from './worker.js';

export const brainRegions = [
  { key: 'concepts', label: 'Concepts', capacity: 12 },
  { key: 'relationships', label: 'Relationships', capacity: 6 },
  { key: 'ideas', label: 'Open ideas', capacity: 3 },
  { key: 'standards', label: 'Undefined standards', capacity: 4 },
  { key: 'churn', label: 'Context churn', capacity: 3 },
] as const;

export type BrainRegionKey = typeof brainRegions[number]['key'];

export interface BrainPressure {
  key: BrainRegionKey;
  label: string;
  value: number;
  capacity: number;
  pressure: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function pressureForMoment(moment: CognitiveMoment): BrainPressure[] {
  const values: Record<BrainRegionKey, number> = {
    concepts: moment.activeEntities.length,
    relationships: moment.activeRelationships.length,
    ideas: moment.activeIdeas.length,
    standards: moment.activeDecisionStandards.length,
    churn: moment.roleChanges + moment.reactivations,
  };
  return brainRegions.map((region) => ({
    ...region,
    value: values[region.key],
    pressure: clamp(values[region.key] / region.capacity),
  }));
}

export function pressureStatus(regions: BrainPressure[]): 'clear' | 'busy' | 'overloaded' {
  const highest = Math.max(0, ...regions.map((region) => region.value / region.capacity));
  if (highest >= 1) return 'overloaded';
  if (highest >= 0.65) return 'busy';
  return 'clear';
}
