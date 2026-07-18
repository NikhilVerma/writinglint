# WritingLint npm smoke project

This is a real consumer project, not a member of the repository workspace. It
installs the exact public `writinglint` version, runs its generated executable,
checks the bundled parser, and rejects any dependency graph containing the
retired `nlpgraph` package.

The publish workflow copies this fixture to a fresh temporary directory before
installation, so workspace links and repository `node_modules` cannot satisfy
undeclared dependencies.
