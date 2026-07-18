# SlopSift for Chrome

An early Manifest V3 extension that puts SlopSift diagnostics into web editors.
It analyzes text locally with the same rulepack and owned INT8 ONNX dependency
parser as the CLI. Draft text is sent only from the content script to the
extension's own service worker; it is never stored or sent over the network.

## Build and load

```sh
npm run build -w slopsift-chrome-extension
npm run check-types -w slopsift-chrome-extension
npm run smoke -w slopsift-chrome-extension
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and
select `packages/slopsift-chrome/dist`.

For a small manual harness, serve `packages/slopsift-chrome/test` over HTTP and
open `manual.html`. Focus or edit the textarea; the field badge should appear
after the model's first cold load.

On a clean checkout, `npm run build` stages the same pinned `compact-int8-v1`
model shipped by `writinglint-parser-node` and verifies every file against its
byte count and SHA-256 before packaging it. Set `SLOPSIFT_MODEL` to use another
complete local INT8 bundle. Use `npm run build:offline` when the package model
is already staged and network access must be forbidden. The approximately 15 MB
parser plus the ONNX WASM runtime are copied into the extension, so the built
extension works offline.

Data handling is documented in [PRIVACY.md](./PRIVACY.md). Host the matching
policy page from `packages/slopsift-web` before a Chrome Web Store submission.

CI that should not download the model can still run the complete source gate:

```sh
npm run check -w slopsift-chrome-extension
```

That command typechecks, runs unit tests, validates Manifest V3 and its minimal
permission set, and rejects remote resource loads. The post-build `smoke` check
also verifies the packaged model and runtime assets.

## MVP behavior

- Lints text inputs, textareas, and `contenteditable` elements after a short
  typing pause.
- Uses mirrored, pointer-free decoration for form controls and the CSS Custom
  Highlight API for rich editors; it does not rewrite editor content.
- Shows a small field badge and a diagnostic list. Selecting a diagnostic
  selects the corresponding source text.
- Stores only `enabled` and minimum-severity settings in `chrome.storage.local`.
- Runs the strict rulepack internally, then filters display to error, warning,
  or informational findings in the popup.

## Current limitations

- Rich editors that model their document in canvas, an iframe without an HTTP(S)
  origin, or a closed shadow root are not visible to a normal content script.
- `contenteditable` offsets follow `textContent`. Editors that synthesize visual
  whitespace between block nodes may show a shifted selection.
- One field is capped at 50,000 UTF-16 code units, and one sentence at 256 model
  subwords.
- The service worker reloads the approximately 15 MB model after Chrome evicts
  it. The first lint after a cold start is therefore slower.
- The browser parser loader currently mirrors `packages/web/src/client/parser-browser.ts`.
  A shared browser-runtime package should replace that duplication once the web
  and extension integrations settle.

## Privacy and store review

The only extension API permission is `storage`. Static content scripts request
access to HTTP(S) pages because editor text lives inside those pages; Chrome will
surface that broad site access during installation. There is no remote code,
telemetry, account system, model download, or host request from the built
extension. Before Chrome Web Store submission, decide whether always-on linting
or per-site optional access is the right trust tradeoff, then add final PNG
icons, screenshots, and a manual test matrix
covering Gmail, Google Docs, Notion, GitHub, and common textarea editors.
