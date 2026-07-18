# Changesets

User-visible changes to published packages need a Changeset. Run:

```sh
npm run changeset
```

Select every affected public package, choose the SemVer bump, and write a short
summary for users. Commit the generated Markdown file with the change.

The release workflow collects Changesets into a version pull request. After
that pull request is reviewed and merged, a maintainer runs the **Publish npm
packages** workflow. Changesets publishes only versions not already on npm and
creates the corresponding package tags.

Changes that affect only documentation, tests, CI, experiments, or an
unreleased private app do not need a Changeset.
