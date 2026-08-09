// Per-(leaf criterion, inventory anchor) evidence-discovery run — one row per work
// unit the inventory-first scope workflow fans out over. Stage D of
// `_docs/features/dbs-pivot/operate-inventory-first-scope-plan.md`.
//
// WHY A TABLE, not `controlAgentRuns.result`: the whole point is to feed the most
// recent SUCCESSFUL unit for the same (criterion, anchor) back to the next
// application as a prior example. That is an indexed lookup on a normalized key,
// which unstructured chat text / a JSONB blob on a per-control row cannot serve
// without a full scan. `controlAgentRuns` stays the per-CONTROL record; this is
// the per-UNIT record, and the two are linked by `controlAgentRunId`.
//
// These rows are a HISTORY log, not scope state: the authoritative scope is still
// `control_relevant_items`, written once by the finalizer. Nothing reads a unit run
// to decide current scope.
