/**
 * Config resolution — how a user turns rules on/off, tunes their options, and
 * registers rulepacks (including their own). Modeled on ESLint's flat config and
 * Harper's Weir "base pack + override layer": `extends` pulls in preset configs,
 * later entries win, and `plugins` maps a namespace to a rulepack.
 */
import type { Rulepack, Category } from './pack.js';
import type { ActiveSeverity, Rule, Severity } from './rule.js';

/** A rule setting: a severity, or a `[severity, options]` tuple. */
export type RuleSetting = Severity | [Severity, unknown];

export interface Config {
  /** namespace → rulepack (e.g. { 'ai-style': aiStyle }). */
  plugins?: Record<string, Rulepack>;
  /** Preset configs to layer in first; later `extends` and own `rules` win. */
  extends?: Config[];
  /** ruleId → setting, e.g. { 'ai-style/rule-of-three': ['warn', { min: 3 }] }. */
  rules?: Record<string, RuleSetting>;
}

/** Identity helper for authoring a config (typing + a stable call site). */
export function defineConfig(config: Config): Config {
  return config;
}

/** One enabled rule, fully resolved and ready to instantiate. */
export interface ResolvedRule {
  ruleId: string;
  rule: Rule<any>;
  category: string;
  severity: ActiveSeverity;
  options: unknown;
}

/** A flattened, ready-to-run config. */
export interface ResolvedConfig {
  /** ruleId → the resolved, enabled rule. Disabled rules are absent. */
  rules: Map<string, ResolvedRule>;
  /** Merged category metadata from every referenced pack, keyed by category id. */
  categories: Record<string, Category>;
}

function severityOf(setting: RuleSetting): Severity {
  return Array.isArray(setting) ? setting[0] : setting;
}

function optionsOf(setting: RuleSetting): unknown {
  return Array.isArray(setting) ? setting[1] : undefined;
}

/** Recursively collect plugins, later definitions overriding earlier ones. */
function collectPlugins(config: Config, into: Map<string, Rulepack>): void {
  for (const ext of config.extends ?? []) collectPlugins(ext, into);
  for (const [ns, pack] of Object.entries(config.plugins ?? {})) into.set(ns, pack);
}

/** Recursively collect rule settings, later definitions overriding earlier ones. */
function collectRules(config: Config, into: Map<string, RuleSetting>): void {
  for (const ext of config.extends ?? []) collectRules(ext, into);
  for (const [id, setting] of Object.entries(config.rules ?? {})) into.set(id, setting);
}

/**
 * Flatten a Config into the set of enabled rules + merged category metadata.
 * Rules set to 'off' (or never turned on) are omitted. A rule referencing an
 * unregistered pack, an unknown rule name, or 'off' is skipped silently — a
 * config can disable rules from packs it doesn't otherwise use.
 */
export function resolveConfig(config: Config): ResolvedConfig {
  const plugins = new Map<string, Rulepack>();
  collectPlugins(config, plugins);

  const settings = new Map<string, RuleSetting>();
  collectRules(config, settings);

  const categories: Record<string, Category> = {};
  for (const pack of plugins.values()) {
    for (const [id, cat] of Object.entries(pack.categories ?? {})) categories[id] = cat;
  }

  const rules = new Map<string, ResolvedRule>();
  for (const [ruleId, setting] of settings) {
    const severity = severityOf(setting);
    if (severity === 'off') continue;

    const slash = ruleId.indexOf('/');
    if (slash === -1) continue;
    const ns = ruleId.slice(0, slash);
    const name = ruleId.slice(slash + 1);
    const pack = plugins.get(ns);
    const rule = pack?.rules[name];
    if (!rule) continue;

    rules.set(ruleId, {
      ruleId,
      rule,
      category: rule.meta.category,
      severity,
      options: optionsOf(setting) ?? {},
    });
  }

  return { rules, categories };
}
