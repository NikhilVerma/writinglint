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

## Why a PAT is used today

Visual Studio Marketplace does not offer npm-style trusted publishing directly
from a GitHub repository. Microsoft's secretless publishing route uses a
Microsoft Entra identity, workload identity federation, Marketplace publisher
membership, and `vsce publish --azure-credential`.

GitHub Actions can federate into Microsoft Entra with OIDC, but Marketplace
publishing still needs a user-assigned managed identity. Creating that Azure
resource requires an Azure subscription, which was not available when this
publisher was configured. The narrowly scoped PAT is therefore the temporary
credential. GitHub still builds, tests, packages, and publishes each release
automatically.

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

## Entra and OIDC migration

The long-term workflow should:

1. Create a user-assigned managed identity in Azure.
2. Add a federated credential restricted to this repository and the
   `vscode-marketplace` GitHub environment.
3. Add that identity to the `NikhilVerma01` Marketplace publisher with the
   Contributor role.
4. Give the workflow `id-token: write`, authenticate to Azure with GitHub OIDC,
   and publish with `vsce publish --azure-credential`.
5. Delete the `VSCE_PAT` repository secret and revoke the Azure DevOps PAT.

Microsoft's current VS Code documentation demonstrates the Entra flow through
Azure Pipelines. GitHub documents the corresponding GitHub Actions to Entra
OIDC exchange. Treat the GitHub-based migration as incomplete until a release
has been published and installed from Marketplace without `VSCE_PAT`.

References:

- [VS Code secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
- [GitHub Actions OIDC in Azure](https://docs.github.com/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)

## Rotation and failure handling

- Rotate the PAT before October 19, 2026 if the Entra migration is not complete.
- Replace the `VSCE_PAT` Actions secret before revoking the old token.
- Run the workflow manually and verify all five target packages in Marketplace.
- Revoke a token immediately if it appears in logs or any repository content.
- A failed publish does not require a version bump when Marketplace has not
  accepted that version. Retry with `--skip-duplicate` after fixing the cause.

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
