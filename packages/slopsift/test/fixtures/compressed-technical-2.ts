// Anchor-narrowed checklist-item search — the retrieval half of Stage C of
// `_docs/features/dbs-pivot/operate-inventory-first-scope-plan.md`.
//
// The existing `search_checklist_items` MCP tool searches the WHOLE application's
// evidenced item pool for a whole control. That is the recall problem the plan is
// fixing: one broad agent writing broad queries reliably misses items belonging to
// services it did not think to mention.
//
// This helper keeps the same evidence gate — an item is only a candidate if THIS
// application already has non-deleted evidence for it — and then narrows to the
// work unit's anchor before ranking. Narrowing is a RE-RANK plus a soft filter,
// never a hard one: if the anchor filter would empty the result set, the unfiltered
// (still evidence-gated) ranking is returned instead. A unit that returns nothing
// because the anchor hint was too literal is strictly worse than one that returns
// slightly-off candidates the agent can reject.
