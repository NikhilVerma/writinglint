# SlopSift for VS Code

SlopSift marks AI-writing habits in the editor and lists them in VS Code's Problems panel. It handles Markdown and plain text directly, and checks comments in supported source files.

The parser, model, and rules are bundled with the extension. Your draft stays on the machine running the VS Code extension host. SlopSift does not use telemetry or send document text to a service.

## What it catches

- stock phrases and chatbot mannerisms;
- repeated rhetorical scaffolding and rule-of-three cadence;
- unsupported certainty and vague attribution;
- dependency-backed patterns such as false agency, corrective contrasts, and mechanical sequencing;
- repetition across nearby sentences and paragraphs.

SlopSift points to patterns worth editing. It does not try to identify whether a person or a model wrote the text.

## Use it

Open a Markdown, plain-text, or supported source file. Diagnostics appear after edits and on save.

- Run **SlopSift: Lint Active Document** to lint immediately.
- Run **SlopSift: Show Output** to inspect model and runtime messages.
- Select a finding in the Problems panel to jump to its source range.

The default level is `warning`. Set `slopsift.minimumLevel` to `info` for every review candidate or `error` for high-confidence findings only.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `slopsift.enable` | `true` | Enable local diagnostics. |
| `slopsift.minimumLevel` | `warning` | Show `info`, `warning`, or `error` findings and above. |
| `slopsift.debounceMilliseconds` | `450` | Wait this long after an edit before linting. |
| `slopsift.modelPath` | empty | Use an advanced, local model bundle instead of the bundled model. |
| `slopsift.downloadModel` | `false` | Permit a model download only if a local model cannot be loaded. Inference remains local. |

## Platform support

The extension uses native ONNX Runtime builds and is published separately for:

- macOS on Apple silicon;
- Linux on x64 and arm64;
- Windows on x64 and arm64.

Intel macOS and browser-hosted VS Code are not supported by the current native runtime. Remote workspaces use the build matching the remote extension host.

## Project

- [SlopSift website and browser editor](https://slopsift.dev/)
- [Source code](https://github.com/NikhilVerma/writinglint)
- [Issues and false-positive reports](https://github.com/NikhilVerma/writinglint/issues)
- [Privacy](https://slopsift.dev/privacy/)

SlopSift is open source under the MIT License.

## Development

From the monorepo root:

```bash
npm install
npm test -w slopsift-vscode
npm run test:release -w slopsift-vscode
```

`test:release` builds a platform-specific VSIX and runs the extension inside an isolated VS Code Extension Development Host. To package every supported target from an ONNX Runtime installation containing the cross-platform binaries:

```bash
npm run vsix -w slopsift-vscode -- --all
```
