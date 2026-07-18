# Sloplint for Chrome privacy policy

Last updated: July 18, 2026

Sloplint analyzes writing locally on your device. The extension does not sell,
share, transmit, or retain the text you lint.

## Data handling

- Draft text moves from the page's content script to Sloplint's own extension
  service worker for local analysis.
- The parser model and rule engine are packaged with the extension. Inference
  does not call a remote API.
- Draft text, findings, page contents, and browsing history are not stored.
- Sloplint has no analytics, telemetry, advertising, or account system.
- The extension stores only whether it is enabled and the selected minimum
  severity in Chrome's local extension storage.

## Permissions

Sloplint uses the `storage` permission for those two settings. Its content
script runs on HTTP and HTTPS pages so it can lint editable fields. It does not
inspect fields until they receive focus and contain enough text to lint.

## Changes and contact

Material changes to this policy will be recorded in the repository and on the
public policy page before a new extension release. Report privacy or security
concerns through the private process in the repository's
[`SECURITY.md`](../../SECURITY.md).
