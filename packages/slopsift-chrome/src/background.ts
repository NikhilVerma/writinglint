import { loadLinter, strictConfig } from './browser-engine.js';
import type { LintDiagnostic, RuntimeRequest, RuntimeResponse } from './protocol.js';

const MAX_TEXT_LENGTH = 50_000;
let queue = Promise.resolve();

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const request = raw as RuntimeRequest;
  if (request?.type === 'status') {
    sendResponse({ ok: true, ready: true } satisfies RuntimeResponse);
    return;
  }
  if (request?.type !== 'lint' || typeof request.text !== 'string') return;
  if (request.text.length > MAX_TEXT_LENGTH) {
    sendResponse({
      ok: false,
      error: `This field is over the ${MAX_TEXT_LENGTH.toLocaleString()} character MVP limit.`,
    } satisfies RuntimeResponse);
    return;
  }
  queue = queue.then(async () => {
    try {
      const linter = await loadLinter();
      const { lints } = await linter.lint(request.text, strictConfig);
      sendResponse({ ok: true, lints: lints as LintDiagnostic[] } satisfies RuntimeResponse);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RuntimeResponse);
    }
  });
  return true;
});
