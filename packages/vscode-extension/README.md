# SlopSift for VS Code

> **Experimental and untested.** This extension is a development prototype. It
> has not completed cross-platform manual QA and is not published in the VS Code
> Marketplace. Do not present it as an available SlopSift product.

SlopSift puts local, ESLint-like AI-slop diagnostics in VS Code's Problems
panel. It lints Markdown and plain text as prose, and extracts comments from
supported source files. The parser and rules run inside the extension host; no
document text is sent to a service.

## Development preview

Open a supported document. SlopSift runs when the document opens, after edits,
and on save. Findings use the same levels as the CLI:

- error: a high-confidence slop signature;
- warning: suspected slop that needs editorial judgment;
- information: a broad review candidate.

Use **SlopSift: Lint Active Document** to force a run and **SlopSift: Show
Output** for model and runtime details.

## Settings

- `slopsift.enable`: enable diagnostics (default `true`).
- `slopsift.minimumLevel`: `info`, `warning`, or `error` (default `warning`).
- `slopsift.debounceMilliseconds`: delay after edits (default `450`).
- `slopsift.modelPath`: an optional absolute model-bundle path.
- `slopsift.downloadModel`: permit an emergency model download if neither the
  bundled nor configured model can be used (default `false`).

Inference is always local. Every platform-specific VSIX includes the compact
INT8 model and works offline immediately after installation.

## Development

From the monorepo root:

```bash
npm install
npm run compile -w slopsift-vscode
npm test -w slopsift-vscode
npm run vsix -w slopsift-vscode
```

The build bundles the TypeScript implementation, compact model, and ONNX Runtime
for the current operating-system/architecture. The packaging script labels the VSIX
with that Marketplace target (for example, `darwin-arm64`). Produce each target
VSIX on its matching platform; a macOS arm64 build is not portable to Linux or
Windows.

Press `F5` in VS Code with this package as the extension development path to
exercise it in an Extension Development Host.

## Current limits

- This first release targets desktop/remote VS Code, not vscode.dev. Native ONNX
  Runtime is required.
- Cancellation cannot interrupt an ONNX call already in progress. Versioned
  results prevent stale diagnostics from being published.
- Quick fixes are not exposed yet, even where a rule has a safe text fix.
