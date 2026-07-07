/**
 * A rulepack — the unit of distribution. It bundles a set of rules, the
 * category metadata the UI groups them by, and one or more named preset configs
 * (`recommended`, `all`). "ai-style" is the first pack; grammar / clarity /
 * house-style packs (and user-authored packs) plug in the same way.
 */
import type { Rule } from './rule.js';
import type { Config } from './config.js';

/** A display grouping for rules (label, blurb, colour/weight hints). */
export interface Category {
  id: string;
  label: string;
  /** One-line description shown in the legend / tooltips. */
  blurb: string;
  /** Rough display weight / order hint. */
  weight?: number;
}

export interface Rulepack {
  /** Namespace used to reference this pack's rules, e.g. 'ai-style'. */
  name: string;
  /**
   * Rules keyed by their short name (the part after 'name/'). Stored as
   * `Rule<any>` because a pack holds rules with heterogeneous Options types;
   * each rule keeps its own typing at the `defineRule` call site.
   */
  rules: Record<string, Rule<any>>;
  /** Category metadata keyed by category id. */
  categories?: Record<string, Category>;
  /** Named preset configs consumers can `extends`, e.g. `configs.recommended`. */
  configs?: Record<string, Config>;
}

/** Identity helper for authoring a pack. */
export function definePack(pack: Rulepack): Rulepack {
  return pack;
}
