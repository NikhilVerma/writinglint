# SlopSift agent plugin

This directory contains three thin adapters around the same local validator:

- Claude Code and Codex load `hooks/hooks.json` and run the Stop hook.
- Pi loads `extensions/pi.ts` and queues a correction as a follow-up turn.
- `scripts/stop-hook.mjs` invokes the published `slopsift` CLI and returns only
  the JSON object expected by the host.

The default check covers the final assistant response. It allows a clean
response, asks the agent to rewrite a response with warning-level findings, and
stops asking after two failed rewrites. Model or process failures are shown to
the user and allowed through, so a broken linter cannot trap an agent in a
loop.

## Try this checkout

Build the local CLI before testing the plugin runner:

```bash
npm run build -w slopsift
SLOPSIFT_HOOK_CLI="$PWD/packages/slopsift/dist/cli.js" \
  node plugins/slopsift/scripts/stop-hook.mjs < hook-event.json
```

Pi can load the extension directly:

```bash
pi -e ./plugins/slopsift/extensions/pi.ts
pi -e ./plugins/slopsift/extensions/pi.ts --slopsift-dirty --slopsift-transcript
```

See [the full guide](../../packages/slopsift/AGENT-HOOKS.md) for marketplace
installation, standalone hook configuration, environment variables, dirty-tree
semantics, transcript formats, and the smoke test.
