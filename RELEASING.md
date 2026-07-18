# Releasing packages

Published packages use [Changesets](https://github.com/changesets/changesets)
for independent SemVer versions and changelogs. Publishing is deliberately
separate from deployment of the documentation site.

## One-time npm and GitHub setup

For each public npm package, configure the npm trusted publisher with:

- provider: GitHub Actions;
- owner: `NikhilVerma`;
- repository: `writinglint`;
- workflow filename: `publish.yml`;
- environment: `npm`; and
- allowed action: `npm publish`.

In GitHub, create the `npm` environment and require approval if desired. After
the first trusted publish succeeds, disallow token-based publishing for each
package and revoke obsolete npm automation tokens. The workflow intentionally
uses OIDC instead of an `NPM_TOKEN`; npm generates provenance automatically for
public packages published from the public repository.

Also enable these repository settings:

- private vulnerability reporting, secret scanning, and push protection;
- Dependabot alerts and security updates;
- branch protection for `main`, requiring the CI and dependency-review checks;
- tag protection for package tags; and
- approval for the `npm` deployment environment.

## Release flow

1. User-visible package changes include a Changeset (`npm run changeset`).
2. Merging those changes into `main` updates the **Release PR** automatically.
3. Review its package versions, dependency ranges, and generated changelogs.
4. Merge the release pull request only after CI passes.
5. Run **Publish npm packages** from the Actions tab and approve the `npm`
   environment deployment.
6. The workflow reruns all checks, audits the tarballs, publishes only versions
   absent from npm, and pushes package tags.
7. Smoke-test the public artifacts in an empty directory, including
   `bunx sloplint@<version> --version` and `npx writinglint@<version> --help`.

Never publish manually from an unclean local checkout. If publication partially
fails, do not reuse a version already accepted by npm. Fix the cause, add a new
patch Changeset where needed, and run the release flow again.
