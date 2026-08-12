# SlopSift npm smoke project

This directory is deliberately outside the monorepo's `packages/*` workspace.
CI copies it to a temporary directory and installs the packed SlopSift tarballs,
which catches workspace leakage before publication:

```sh
npm run smoke:packed
```

The fixture verifies the installed CLI, the transitive bundled parser, offline
execution, JSON output, lexical and structural rules, the reader-first rulepack,
and the literal construction exemption. CI copies this directory into a fresh temporary directory before
installing, so parent workspaces and existing `node_modules` cannot affect it.
`npm run smoke:published` switches the same fixture to the exact registry
versions and waits for transitive parser and rulepack releases to reach npm.
