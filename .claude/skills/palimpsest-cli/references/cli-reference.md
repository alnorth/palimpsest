# palimpsest CLI — full reference

Source of truth: `packages/cli/src/cli/program.ts` (flags),
`packages/cli/src/cli/runQuery.ts` (envelope shape),
`packages/cli/src/cli/serialize.ts` (per-entity JSON).

## Output envelope

Every subcommand prints one JSON object to stdout on success (exit 0):

```json
{ "ok": true, "count": 3, "total": 10, "truncated": true, "tasks": [ ... ] }
```

- `count` — number of items actually returned (after `--limit`).
- `total` — number of items that matched before `--limit` was applied.
- `truncated` — `true` if `--limit` cut off results.
- The array key varies by subcommand: `tasks`, `projects`, `spheres`,
  `agendas`, `contexts`. `palimpsest task <id>` instead returns
  `{ "ok": true, "task": { ... } }` (no count/total/truncated).

On failure: one line to stderr, exit code 1, stdout is empty. There is no
structured/JSON error format.

## `palimpsest tasks`

| Flag | Value | Notes |
|---|---|---|
| `--sphere <name>` | sphere id or name | |
| `--project <name>` | project id or name | resolved within `--sphere` if both given |
| `--agenda <name>` | agenda id or name | resolved within `--sphere` if both given |
| `--context <name>` | context id or name | resolved within `--sphere` if both given |
| `--status <status>` | `open`\|`completed`\|`deleted`\|`any` | default `open` |
| `--starred` | flag | only starred tasks |
| `--actionable` | flag | only actionable tasks |
| `--waiting` | flag | only tasks waiting on someone/something |
| `--not-waiting` | flag | only tasks not waiting |
| `--inbox` | flag | only tasks with no project |
| `--due-on <date>` | `YYYY-MM-DD` or `today` | |
| `--due-before <date>` | `YYYY-MM-DD` or `today` | |
| `--include-archived` | flag | include tasks whose project is archived |
| `--limit <n>` | positive integer | errors if not a positive integer |

`TaskJson` shape (one entry in the `tasks` array, and the shape of
`palimpsest task <id>`'s `task` field):

```ts
{
  id: string
  title: string
  description: string
  status: "open" | "completed" | "deleted"
  sphere: { id: string, name: string } | null
  project: { id: string, name: string } | null
  agenda: { id: string, name: string } | null
  context: { id: string, name: string } | null
  dueDate: string | null          // YYYY-MM-DD
  recurrence: string | null       // verbatim recurrence expression, e.g. "every monday"
  isNext: boolean
  isStarred: boolean
  waitingFor:
    | { kind: "review" }
    | { kind: "agenda", id: string, name: string }
    | { kind: "project", id: string, name: string }
    | { kind: "trello", cardUrl: string }
    | null
  createdAt: string               // ISO 8601
  updatedAt: string                // ISO 8601
  completedAt: string | null       // ISO 8601
}
```

## `palimpsest task <id>`

Positional `<id>` — a task id. Returns `{ ok: true, task: TaskJson }` or
errors `No task with id "<id>".` if not found.

## `palimpsest projects`

| Flag | Value | Notes |
|---|---|---|
| `--sphere <name>` | sphere id or name | |
| `--archived` | flag | only archived projects |
| `--all` | flag | include both active and archived (overrides `--archived`) |

`ProjectJson`:

```ts
{
  id: string
  name: string
  description: string | null
  sphere: { id: string, name: string } | null
  isArchived: boolean
  openTaskCount: number
  hasNextAction: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}
```

Sorted by name.

## `palimpsest spheres`

No flags. `SphereJson`:

```ts
{ id: string, name: string, description: string | null }
```

Sorted by name.

## `palimpsest agendas`

| Flag | Value |
|---|---|
| `--sphere <name>` | sphere id or name |

`AgendaJson`:

```ts
{ id: string, name: string, sphere: { id: string, name: string } | null, key: string | null }
```

Sorted by name (agenda `title`).

## `palimpsest contexts`

| Flag | Value |
|---|---|
| `--sphere <name>` | sphere id or name |

`ContextJson`:

```ts
{
  id: string
  name: string
  sphere: { id: string, name: string } | null
  key: string | null
  description: string | null
}
```

Sorted by name.

## Name resolution errors (`--sphere`/`--project`/`--agenda`/`--context`)

Matching order: exact id → case-insensitive exact name → case-insensitive
substring.

- No match: `No <kind> matching "<input>". Known <kind>s: <name1>, <name2>, ...`
  (or `No <kind>s exist yet.` if there are none).
- Multiple matches: `Ambiguous <kind> "<input>" matches multiple: <name1>, <name2>, .... Use a more specific name.`

Both are safe to retry against — re-issue the command with one of the
listed names.

## Store selection (env vars)

Checked in this order (first match wins), read from `process.env` merged
over `~/.palimpsest/.env` (real env vars win):

1. `PALIMPSEST_TODOIST_TOKEN` set → Todoist-backed store. Initializing it
   runs a full sync, which can flush previously-queued local writes from
   `~/.palimpsest/todoist-pending.json`.
2. `PALIMPSEST_API_URL` + `PALIMPSEST_AUTH_TOKEN` both set → remote
   sync-API-backed store (`POST {PALIMPSEST_API_URL}/sync` with
   `Authorization: Bearer {PALIMPSEST_AUTH_TOKEN}`).
3. Otherwise → local JSONL file at `PALIMPSEST_FILE` or
   `~/.palimpsest/events.jsonl`.
