/**
 * The most recent SUCCESSFUL unit run for the same leaf criterion and the same
 * anchor fingerprint, from a different application — the scope-level prior example.
 *
 * Match order mirrors the L2 criteria lookup:
 *   1. same `frameworkCriterionId` (works across controls that share an L1);
 *   2. otherwise same `statementId` + same normalized criterion name.
 * The anchor fingerprint (`serviceName`, `resourceType`) must match in both cases —
 * an S3 example teaches nothing about an RDS unit.
 *
 * Runs that selected NOTHING are excluded: "the last finder found no items" is not
 * a working example, and offering it would nudge the next finder toward the same
 * empty result.
 */
