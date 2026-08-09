/**
 * Single-control scope discovery, inventory-first (Stage E of
 * `_docs/features/dbs-pivot/operate-inventory-first-scope-plan.md`).
 *
 *   prepareControlScopeUnitsActivity
 *     -> concurrentPool over runControlScopeUnitEvidenceFinderActivity
 *     -> finalizeControlScopeDiscoveryActivity
 *
 * This replaces the single broad control-level agent turn. The change that
 * matters is not parallelism, it is DECOMPOSITION: each `(criterion, anchor)`
 * unit gets a focused evidence search instead of one agent writing control-wide
 * queries and silently missing whole services between runs.
 *
 * Fan-out is here, in workflow code, via `concurrentPool` — not `Promise.all`
 * inside an activity. That keeps the concurrency bounded and deterministic on
 * replay, and keeps every unit visible to Temporal as its own activity.
 *
 * Used by the MCP `build_control_relevance` tool and by the bulk workflow's
 * per-control fan-out.
 */
