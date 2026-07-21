# Publishing the VS Code extension

SlopSift publishes its native VS Code extension packages from GitHub Actions.
The workflow builds and tests the extension, creates a VSIX for every supported
target, and uploads them to Visual Studio Marketplace as one extension version.

The workflow currently authenticates with the `VSCE_PAT` GitHub Actions secret.
The token is limited to Visual Studio Marketplace management and is not granted
access to source code, builds, work items, packages, or other Azure DevOps data.

This is a temporary bridge. Microsoft retires global Azure DevOps personal
access tokens on December 1, 2026. Move the workflow to Microsoft Entra
workload identity before then; the current token expires on October 19, 2026.

## Credential setup

The Marketplace PAT must use:

- organization: **All accessible organizations**;
- scope: **Marketplace → Manage** only;
- the shortest practical expiration.

Store the value as a repository Actions secret named `VSCE_PAT`. Never put the
token in a repository variable, workflow file, command argument, issue, or log.
The token is shown only once, so rotate it instead of trying to recover it.

`--skip-duplicate` makes a retry safe when some target packages are already
present in Marketplace.

## Entra migration

The long-term workflow should authenticate with GitHub OIDC and pass
`--azure-credential` to `vsce`. That requires a Microsoft Entra identity backed
by an Azure subscription, a federated credential for the
`vscode-marketplace` GitHub environment, and Contributor membership on the
`NikhilVerma01` Marketplace publisher.

## Release behavior

The workflow runs when:

- `packages/vscode-extension/package.json` changes on `main`;
- a `vscode-v*` tag is pushed; or
- a maintainer starts it manually.

For a release, bump the extension version once and merge it to `main`. Do not
bump the version separately for operating systems or CPU architectures.

Supported targets:

- `darwin-arm64`
- `linux-arm64`
- `linux-x64`
- `win32-arm64`
- `win32-x64`

Intel macOS is not currently published because the bundled native ONNX runtime
does not provide a `darwin-x64` binary.

## Local packaging

From the repository root:

```sh
npm run vsix -w slopsift-vscode -- --all
```

The generated VSIX files are written to `packages/vscode-extension/` and are
ignored by Git.
