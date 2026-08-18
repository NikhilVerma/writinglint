# Reader-first paired cases

`strict-cases.jsonl` contains public synthetic examples derived from recurring prose shapes found during private pull-request audits. It does not copy private text, names, identifiers, or product details.

Each row contains a deliberately difficult version, a simpler rewrite, and the reader-first rules that must reject the difficult version. The test suite also requires every fixed version to pass the recommended pack without warnings or errors.

These cases are regression fixtures, not a blind performance evaluation. Once a case changes a detector, it belongs to the development set.
