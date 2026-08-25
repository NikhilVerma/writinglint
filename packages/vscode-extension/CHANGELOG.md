# Changelog

## 0.1.1

- Run AI-style and reader-first checks together so cognitive-load findings appear in editor diagnostics.
- Keep warnings and errors visible by default; set the minimum level to `info` to include tentative reader-first findings.

## 0.1.0

- Add local SlopSift diagnostics for prose and source-code comments.
- Add configurable minimum level, model location, and edit debounce.
- Add commands to lint the active document and show the output log.
- Bundle the compact parser and platform-specific ONNX Runtime for offline use.
