# Sloplint for VS Code

Sloplint puts local, ESLint-like AI-slop diagnostics in VS Code's Problems
panel. It lints Markdown and plain text as prose, and extracts comments from
supported source files. The parser and rules run inside the extension host; no
document text is sent to a service.

## Use it

Open a supported document. Sloplint runs when the document opens, after edits,
and on save. Findings use the same levels as the CLI:

- error: a high-confidence slop signature;
- warning: suspected slop that needs editorial judgment;
- information: a broad review candidate.

Use **Sloplint: Lint Active Document** to force a run and **Sloplint: Show
Output** for model and runtime details.

## Settings

- `sloplint.enable`: enable diagnostics (default `true`).
- `sloplint.minimumLevel`: `info`, `warning`, or `error` (default `warning`).
- `sloplint.debounceMilliseconds`: delay after edits (default `450`).
- `sloplint.modelPath`: an optional absolute model-bundle path.
- `sloplint.downloadModel`: allow the initial ~16 MB model download (default
  `true`). Set a model path or warm the Sloplint cache before disabling it.

Inference is always local. The default setting may make one network request to
populate the versioned model cache; subsequent runs work offline.

## Development

From the monorepo root:

```bash
npm install
npm run compile -w sloplint-vscode
npm test -w sloplint-vscode
npm run vsix -w sloplint-vscode
```

The build bundles the TypeScript implementation and copies ONNX Runtime for the
current operating-system/architecture. The packaging script labels the VSIX
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
