/**
 * There is deliberately NO per-cycle cap here. The unit count is already bounded by
 * the planner (one unit per leaf once the resource-family split collapses), so a
 * control's fan-out cannot grow unboundedly and history stays a manageable size.
 *
 * An earlier revision capped this at 40 with `maxItems` but never carried the
 * cursor through `continueAsNew` — so a 41+ unit control ran the first 40, then
 * finalized as if that were the whole answer, clearing `criterionRefs` for the
 * items the un-run units would have selected. Finalizing a partial unit set is
 * silent data loss; if a cap is ever needed here it MUST come with `continueAsNew`
 * and accumulated results, and finalize only once every unit has run.
 */
