# Let the agent repair difficult writing before it stops

Install SlopSift once and continue using your coding agent normally. When a
completed response contains a warning or error, SlopSift returns the specific
problems to the agent and asks for another draft. A clean response ends the turn
without an extra model call. Informational findings never interrupt the agent.

The validator runs locally and reports exact rules and source positions. It
detects writing habits; it does not try to decide whether a person or a model
wrote the text.

## Install and prove the loop

In Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add NikhilVerma/writinglint
/plugin install slopsift@slopsift
```

In Codex, run:

```bash
codex plugin marketplace add NikhilVerma/writinglint
codex plugin add slopsift@slopsift
```

Start a new agent session after installation. Then check that the client,
plugin, local model, and Stop-hook decision are ready:

```bash
npx slopsift@0.8.0 agent doctor --host claude-code
npx slopsift@0.8.0 agent doctor --host codex
```

The doctor is read-only. It can confirm that the plugin is installed and
enabled, but only a live turn can prove that the host trusts and runs its hook.
Use this prompt for that final check:

```text
For this hook test, first answer with exactly the sentence below. If a Stop hook
asks you to revise it, follow the hook and preserve the meaning.

Kept modest deliberately: the win comes from narrower prompts, not from
saturating the model gate.
```

The first draft should trigger a correction. When the revised response passes,
SlopSift reports that it accepted the response after one automatic rewrite.

You can exercise the same reject-then-accept decision without launching an
agent:

```bash
npx slopsift@0.8.0 agent demo
```

## How the Stop hook works

Claude Code and Codex expose compatible Stop-hook input and output. SlopSift
reads the hook event from standard input and writes one JSON object to standard
output:

```bash
npx slopsift@0.8.0 hook stop \
  --rulepack ai-style \
  --rulepack reader-first \
  --feedback compact \
  < hook-event.json
```

For an initially clean response, the command writes `{}`. When it finds a
warning or error, it writes a blocking decision whose reason tells the agent
what to revise. After a successful rewrite, it returns a short confirmation for
the user. The agent gets two correction attempts by default. A third failure is
shown to the user and allowed through, which prevents an infinite correction
loop. A model load, malformed event, or other runtime failure also fails open
with a visible `systemMessage`.

The Stop event occurs after the model has produced its response. Depending on
the host, the first draft may already have streamed to the terminal before the
agent receives the correction. A wrapper that buffers model output is still
needed when an application must hide every rejected draft.

## Install the shared plugin from a checkout

This repository contains one plugin directory that both Claude Code and Codex
can load. The plugin runs the pinned `slopsift@0.8.0` package through `npx`, so
Node and npm must be available to the agent process.

Use a local checkout when you are developing the plugin itself. In Claude Code:

```text
/plugin marketplace add /absolute/path/to/writinglint
/plugin install slopsift@slopsift
```

For Codex, add the repository root as a marketplace and install its plugin:

```bash
codex plugin marketplace add /absolute/path/to/writinglint
codex plugin add slopsift@slopsift
```

Codex asks you to trust a newly installed hook before it runs. Review
`plugins/slopsift/hooks/hooks.json` and `plugins/slopsift/scripts/stop-hook.mjs`
before accepting that prompt.

## Configure a standalone hook

You can call the CLI without the plugin. Add this handler under `hooks.Stop` in
`.claude/settings.json` or `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx --yes slopsift@0.8.0 hook stop --rulepack ai-style --rulepack reader-first --feedback compact",
            "timeout": 240
          }
        ]
      }
    ]
  }
}
```

The normal settings hierarchy still applies, so place the hook at user scope
only when you want it in every repository.

## Check the files in the dirty Git tree

Pass `--include-dirty` when the agent should fix prose in files as well as its
final response:

```bash
npx slopsift@0.8.0 hook stop \
  --rulepack ai-style \
  --rulepack reader-first \
  --feedback compact \
  --include-dirty
```

SlopSift asks Git for modified, staged, renamed, and untracked files, skips
deletions and unsupported file types, and reports paths relative to the
repository root. It checks at most 50 files unless you change
`--max-dirty-files`.

This mode deliberately treats the whole dirty tree as the agent's working set.
It cannot tell whether a change existed before the session began. Do not enable
it when unrelated personal edits are present unless you are comfortable asking
the agent to edit them. A future baseline mode can narrow this to files changed
since the session started.

The packaged hook runner reads these environment variables so you can enable
the same behavior without editing the plugin:

```bash
export SLOPSIFT_HOOK_INCLUDE_DIRTY=1
export SLOPSIFT_HOOK_MAX_DIRTY_FILES=100
```

## Read the active transcript

`--include-transcript` checks assistant text stored during the active turn in
addition to the final response. SlopSift currently understands Claude Code,
Codex, and Pi JSONL records. It ignores thinking blocks, tool calls, tool
results, session metadata, and malformed trailing records. It considers only
the current turn and the last 20 assistant messages.

The hook event must supply `transcript_path`, or you must pass
`--transcript-path`. SlopSift processes transcript text locally and never
uploads it.

```bash
npx slopsift@0.8.0 hook stop \
  --rulepack ai-style \
  --rulepack reader-first \
  --feedback compact \
  --include-transcript \
  --transcript-path /path/to/session.jsonl
```

For the plugin runner, set `SLOPSIFT_HOOK_INCLUDE_TRANSCRIPT=1` and optionally
`SLOPSIFT_HOOK_MAX_TRANSCRIPT_MESSAGES`. Transcript findings help the model
avoid repeating poor commentary in its corrected final response. The host may
have shown older messages already, so a correction turn cannot change them
retroactively.

## Use the Pi extension

Pi has a richer extension API than a command-only Stop hook. The included
extension listens for `agent_end`, sends the final assistant text through the
same validator, and queues SlopSift's reason as a follow-up message. Pi then
runs another model turn without relying on the model to remember to call a
linting tool.

Try it directly from this checkout:

```bash
pi -e ./plugins/slopsift/extensions/pi.ts
```

Pi flags opt into the additional evidence sources:

```bash
pi -e ./plugins/slopsift/extensions/pi.ts \
  --slopsift-dirty \
  --slopsift-transcript
```

You can also install the directory as a local Pi package:

```bash
pi install ./plugins/slopsift
```

Pi stores sessions under `~/.pi/agent/sessions/`. Claude Code and Codex also
store JSONL sessions below their own user data directories, but the validator
uses the active path supplied by the host instead of scanning a person's entire
chat history.

## Options and environment variables

The command accepts `--level`, `--max-retries`, `--max-findings`,
`--state-dir`, `--model`, and `--no-download` in addition to the Git and
transcript options above. Run `slopsift hook stop --help` for the complete list.

The plugin uses both rulepacks and compact feedback by default. The plugin
runner maps these environment variables to CLI options:

- `SLOPSIFT_HOOK_LEVEL=warning|error`
- `SLOPSIFT_HOOK_RULEPACKS=ai-style,reader-first`
- `SLOPSIFT_HOOK_FEEDBACK=compact|detailed`
- `SLOPSIFT_HOOK_MAX_RETRIES`
- `SLOPSIFT_HOOK_MAX_FINDINGS`
- `SLOPSIFT_HOOK_INCLUDE_DIRTY=1`
- `SLOPSIFT_HOOK_MAX_DIRTY_FILES`
- `SLOPSIFT_HOOK_INCLUDE_TRANSCRIPT=1`
- `SLOPSIFT_HOOK_MAX_TRANSCRIPT_MESSAGES`
- `SLOPSIFT_HOOK_STATE_DIR`
- `SLOPSIFT_HOOK_NO_DOWNLOAD=1`
- `SLOPSIFT_MODEL`

The plugin never blocks on informational findings. Setting
`SLOPSIFT_HOOK_LEVEL=info` therefore keeps the normal warning threshold. The
standalone CLI still accepts `--level info` for manual editorial review.

To check both AI-style habits and reader load in every agent response, select
both rulepacks:

```bash
npx slopsift@latest hook stop \
  --rulepack ai-style \
  --rulepack reader-first \
  --feedback compact
```

## Give the setup to another agent

Paste this instruction into Claude Code or Codex:

```text
Install SlopSift as a user-scoped Stop hook for every local repository. Detect
whether Claude Code, Codex, or both are installed. Preserve all existing
settings and merge, rather than replace, their Stop hooks in
~/.claude/settings.json and ~/.codex/hooks.json. Run this command from the hook:

npx --yes slopsift@latest hook stop --rulepack ai-style --rulepack reader-first --feedback compact

Do not enable dirty-tree or
transcript checks unless I request them. Before editing settings, confirm that
`slopsift hook stop --help` lists the rulepack options. Validate the resulting
JSON, exercise one known-bad Stop event and one clean rewrite, and tell me to
start a new agent session and approve the hook if the client asks for trust.
```

`PLUGIN_DATA` or `CLAUDE_PLUGIN_DATA` is used for bounded-retry state when the
host provides it. Otherwise the command uses a hashed session key in the
operating system's temporary directory. No transcript content is written to
that state file.

## Test the integration

The unit suite covers the shared hook contract, retry cap, fail-open behavior,
Git status parsing, and all three transcript formats. The smoke test builds the
published CLI shape, runs the plugin adapter against a known bad response, and
bundles the Pi extension to catch syntax or import errors:

```bash
npm run smoke:agent-hook
```

The repository also includes an opt-in live Claude Code test. It makes two paid
model turns, uses the plugin directly from the checkout, caps the allowed spend
at US$0.50, and checks both the rejection and acceptance hook events. CI does
not run it:

```bash
SLOPSIFT_CLAUDE_MODEL=fable npm run smoke:agent-hook:claude
```
