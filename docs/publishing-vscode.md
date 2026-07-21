# Publishing the VS Code extension

SlopSift publishes its native VS Code extension packages from GitHub Actions.
The workflow builds and tests the extension, creates a VSIX for every supported
target, and uploads them to Visual Studio Marketplace as one extension version.

The workflow uses GitHub OIDC and a Microsoft Entra managed identity. It does
not store a Marketplace personal access token. Microsoft retires global Azure
DevOps personal access tokens on December 1, 2026.

## One-time identity setup

1. In Azure, create a user-assigned managed identity in a subscription you
   control. Record its client ID, tenant ID, and subscription ID.
2. Add a federated credential to that identity for this GitHub repository. The
   credential must trust the `vscode-marketplace` GitHub environment in
   `NikhilVerma/writinglint`.
3. In the GitHub repository, create an environment named
   `vscode-marketplace`. Add these environment variables:

   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`

   These identifiers are configuration values, not credentials. The workflow
   receives a short-lived token from GitHub for each run.
4. Run **Publish VS Code extension** manually once. Copy the
   `Marketplace identity resource ID` printed by the workflow.
5. Open the `NikhilVerma01` publisher in Visual Studio Marketplace. On the
   **Members** tab, add that resource ID as a Contributor.
6. Rerun the workflow. It should publish every platform package and report
   duplicates as successful no-ops.

The first run is expected to fail at the publish step until the identity has
been added to the Marketplace publisher. It still prints the identifier needed
to finish that connection.

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
