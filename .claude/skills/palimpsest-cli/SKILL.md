---
name: palimpsest-cli
description: Query Al's palimpsest task manager (tasks, projects, spheres, agendas, contexts) via the read-only `palimpsest` CLI and get JSON back. Use this whenever asked about his to-do list, what's due, what's next, open projects, or anything else in palimpsest.
required_environment_variables:
  - name: PALIMPSEST_TODOIST_TOKEN
    prompt: "Palimpsest Todoist API token (only if the store is backed by Todoist)"
    help: "https://app.todoist.com/app/settings/integrations/developer"
    required_for: "Todoist-backed store (checked first; skip if using the sync API or a local file instead)"
  - name: PALIMPSEST_API_URL
    prompt: "Palimpsest sync API base URL (only if using the hosted sync backend)"
    required_for: "Remote sync-API-backed store (used together with PALIMPSEST_AUTH_TOKEN)"
  - name: PALIMPSEST_AUTH_TOKEN
    prompt: "Bearer token for the palimpsest sync API"
    required_for: "Remote sync-API-backed store (used together with PALIMPSEST_API_URL)"
  - name: PALIMPSEST_FILE
    prompt: "Path to a local palimpsest events.jsonl file (optional)"
    required_for: "Local-file-backed store fallback; defaults to ~/.palimpsest/events.jsonl if unset"
---

# palimpsest CLI

Non-interactive query surface for palimpsest, a personal task manager. Built
for exactly this use case: "this is the surface an LLM agent (or any script)
should use to read the task list" (from the project's own CLAUDE.md).
**Read-only** — there is no create/update/delete yet, so don't try to
modify tasks through this CLI.

## When to Use

Any request to check, summarize, or filter Al's tasks, projects, or
schedule in palimpsest — e.g. "what's on my plate today", "what's next in
the viaLibri sphere", "any tasks waiting on Jim", "list my open projects".

## Setup (one-time per environment)

`palimpsest` is not published to npm (the workspace is private). If the
`palimpsest` binary isn't already on PATH, build it from a checkout of the
monorepo:

```bash
npm install
npm run build --workspace=packages/cli
npm link --workspace=packages/cli   # gives you a global `palimpsest` binary
```

Alternatively, run the built entry point directly without linking:

```bash
node packages/cli/dist/index.js tasks --status open
```

**Always pass a subcommand.** Running `palimpsest` with zero arguments
launches an interactive TUI (ink/react) that will hang waiting for
keyboard input — never do this from a non-interactive shell.

Which backing store is used is controlled entirely by environment
variables (see `required_environment_variables` above); ask the user which
one applies before running queries if none are set.

## Quick Reference

```
palimpsest tasks    [--sphere <name>] [--project <name>] [--agenda <name>] [--context <name>]
                    [--status open|completed|deleted|any] [--starred] [--actionable]
                    [--waiting] [--not-waiting] [--inbox]
                    [--due-on <date|today>] [--due-before <date|today>]
                    [--include-archived] [--limit <n>]
palimpsest task     <id>
palimpsest projects [--sphere <name>] [--archived] [--all]
palimpsest spheres
palimpsest agendas  [--sphere <name>]
palimpsest contexts [--sphere <name>]
```

- `--status` defaults to `open` if omitted.
- `--sphere`/`--project`/`--agenda`/`--context` accept either an id or a
  name (case-insensitive exact match, then substring match).
- `--due-on`/`--due-before` accept `YYYY-MM-DD` or the literal `today`.
- `--limit` must be a positive integer or the command errors.

Full per-field JSON shapes are in `references/cli-reference.md` — load
that only if you need exact field names (e.g. `waitingFor`, `isNext`).

## Known spheres, agendas, and contexts

Hardcoded from this account's real configuration
(`packages/core/src/config.ts`) so you can pass a correct `--sphere`/
`--agenda`/`--context` value on the first try instead of first calling
`palimpsest spheres`/`agendas`/`contexts` to discover them. If a query
returns "no matches", these may be stale — fall back to the live discovery
commands.

- **viaLibri** (business) — agendas: Jim, Marcia, Nicolas, Anton, Dev,
  Showcase, TAB, Devoteam. Contexts: Marketing, Accounting, Strategic,
  Quick, Email, Anytime.
- **Personal** — agendas: Han, Dad. Contexts: Phone, Laptop, Tools,
  Sewing, No tools, Loft, Errands, Daytime, Gaming, Weekdaytime,
  Deep thought.

## Procedure

1. Confirm `palimpsest` is runnable (see Setup) and the right env vars are
   set for the intended store.
2. Build the command from the Quick Reference above, using sphere/agenda/
   context names directly — no need to resolve ids yourself.
3. Run it and parse stdout as JSON.
4. Summarize the relevant fields for the user; don't dump the raw JSON
   unless asked.

## Pitfalls

- **Zero-arg invocation hangs** — always include a subcommand.
- **Unknown/ambiguous name errors are retryable.** On failure, stderr has
  one line like `No sphere matching "wrk". Known spheres: viaLibri,
  Personal.` or `Ambiguous agenda "j" matches multiple: Jim, ...`. Re-run
  with a corrected name from the message — don't guess blindly.
- **Failures never populate stdout.** Success is always a JSON envelope on
  stdout with exit code 0; any failure is a single stderr line with exit
  code 1 and empty stdout. Check the exit code, don't just check for JSON.
- **A "read-only" command can still push queued writes.** If
  `PALIMPSEST_TODOIST_TOKEN` is set, initializing the store runs a full
  Todoist sync, which can flush previously-queued local edits made via the
  TUI. This is expected background behavior, not a bug.

## Verification

After running a query, confirm the process exited 0 and stdout parsed as
valid JSON with `"ok": true` before reporting results to the user.
