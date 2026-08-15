# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep this file up to date.** When making structural changes to the codebase — new modules, changed data flow, new domain concepts, altered invariants — update the relevant sections of this file in the same commit.

**When tagging a release**, always bump the `version` field in the relevant `package.json` to match the tag before committing.

## Development approach

All development must follow a Test-Driven Development (TDD) approach: write failing tests first, then write the minimum code to make them pass, then refactor. Do not implement new functionality without a corresponding test written beforehand.

## Git workflow

Commit directly on `main`. Do not create feature branches or pull requests unless explicitly asked.

## Monorepo structure

This is an npm workspaces monorepo. The only UI surfaces are a local MCP server and a React hooks
library — there is no CLI or web app.

```
packages/core/     — the palimpsest library, published as @alnorth/palimpsest
packages/query/    — shared read query engine (filter/sort/paginate/resolve/serialize) used by
                     both packages/mcp and packages/hooks, published as @alnorth/palimpsest-query
                     — see packages/query section below
packages/todoist/  — PalimpsestStore backed by the Todoist Sync API (read + write mapping),
                     published as @alnorth/palimpsest-todoist
packages/mcp/      — local MCP server exposing the query engine's read operations plus a small
                     but growing set of write tools over stdio, against a Todoist-backed store —
                     see packages/mcp section below
packages/hooks/    — React hooks + Context library for reading, and (starting with task
                     completion) writing, palimpsest data from third-party apps (web, React
                     Native, etc.), published as @alnorth/palimpsest-hooks — see packages/hooks
                     section below
packages/backend/  — AWS Lambda sync API (DynamoDB event store, conflict resolution)
packages/cdk/      — AWS CDK infrastructure (Lambda, API Gateway, DynamoDB)
```

### Publishing

`packages/core`, `packages/query`, `packages/todoist`, and `packages/hooks` are published to **GitHub
Packages** (not npm — the plain name `palimpsest` is already taken there) under the `@alnorth` scope,
via `.github/workflows/publish-packages.yml`, triggered on push of a `v*` tag. `packages/mcp` and
`packages/backend` are consumers only and are never published. Installing `@alnorth/*` packages from a
different repo (e.g. `cockpit`) always requires an authenticated `.npmrc` pointing `@alnorth` at
`https://npm.pkg.github.com` — GitHub Packages requires auth even for public packages, unlike npmjs.

Run `npm install` from the repo root before running typechecks or tests in a fresh environment — missing `node_modules` will cause spurious errors.

Run commands from the repo root, or `cd` into a package directory:

```bash
npm test                                              # run core tests (vitest)
npm run build --workspaces                            # build all packages
npm run typecheck --workspaces                        # typecheck all packages
npm run test --workspace=packages/core                # core tests only
npm run test:watch --workspace=packages/core          # core tests in watch mode
npm run test --workspace=packages/query               # query engine tests
npm run test --workspace=packages/mcp                 # MCP server tests
npm run dev --workspace=packages/mcp                  # run MCP server dev (tsx, stdio transport)
npm run build --workspace=packages/mcp                # build MCP server
npm run test --workspace=packages/hooks               # hooks library tests
npm run build --workspace=packages/hooks              # build hooks library
npm run test --workspace=packages/backend             # backend tests
npm run build --workspace=packages/backend            # build Lambda bundle (dist/)
npm run deploy --workspace=packages/cdk               # deploy to AWS (profile: dashboard)
npm run deploy:ci --workspace=packages/cdk            # deploy without approval prompt (CI)
```

To run a single test file (from packages/core):
```bash
npx vitest run src/dateParser.test.ts
```

To run tests matching a name pattern:
```bash
npx vitest run -t "weekly"
```

## Architecture

### packages/core

`packages/core` is a pure TypeScript library with no runtime framework. The architecture is strict event-sourcing: all state is derived by replaying an append-only log of events; there is no mutable store of current state.

### Data flow (core)

```
commands.ts  →  events.ts  →  projection.ts  →  query.ts
  (creates)      (types)        (replays)        (reads)
                    ↕
                store.ts
               (JSONL I/O)
```

**`commands.ts`** — Pure functions `(ProjectionState, input) → PalimpsestEvent[]`. They validate inputs and produce events but never write to disk. `completeTask` branches on whether the task has a `dueDateExpression`: recurring tasks get `task.recurred` (due date advances, task stays open); non-recurring tasks get `task.completed` (task closed).

**`events.ts`** — Discriminated union `PalimpsestEvent` covering all 14 event types. Patch objects use `CLEAR = null` as a sentinel to distinguish "remove this optional field" from "leave this field unchanged" (undefined). Never use `undefined` in a patch to mean removal.

**`projection.ts`** — `applyEvent(state, event)` mutates state in-place for performance. `project(events[])` folds all events into a fresh state. Two invariants enforced here: `task.completed` is a no-op on recurring tasks; `task.recurred` is a no-op on non-recurring tasks — the projection stays resilient to invalid events.

**`store.ts`** — The only file that touches the filesystem. Thin wrapper: `readAllEvents()`, `appendEvents()`, `getState()`. No caching — callers maintain state in memory and call `applyEvent()` for each event they append.

**`query.ts`** — Stateless read functions over `ProjectionState`. `getTaskSphereId(state, task)` is the key derived helper: tasks may belong to a sphere directly (`task.sphereId`) or inherit it from their project (`task.projectId → project.sphereId`).

**`dateParser.ts`** — Two sections with a shared two-phase structure (parse input → discriminated union, then compute):
- *Due date parsing*: `parseDueDate(input, today)` accepts natural language (`"tomorrow"`, `"next monday"`, `"jan 15"`, `"25/12"`, ISO dates, etc.). Exports `addDays` and `nextWeekday` as utilities.
- *Recurrence*: `isValidExpression(expr)` and `nextDueDate(expr, completedAt)`. Expressions are stored verbatim as entered. Accepted forms: aliases (`"daily"`, `"weekly"`, `"monthly"`, `"quarterly"`, `"yearly"`, `"annually"`, `"fortnightly"`), `"every …"` / `"ev …"` patterns (`"every day"`, `"every monday"`, `"ev mon"`, `"every 15th"`, `"every month"`, `"every jan 1"`, `"every 2 weeks"`, etc.). All dates computed in UTC. Ordinal monthly day is capped at 1–28 to guarantee the day exists in every month.

### Domain model

- **Sphere** — top-level grouping (e.g. "Work", "Personal"). Every project, agenda, and project-less task must belong to one.
- **Project** — belongs to exactly one sphere.
- **Agenda** — belongs to exactly one sphere; has only a `title` (no description). Tasks may optionally be linked to one agenda via `agendaId`.
- **Task** — belongs to a project (inheriting its sphere) OR carries a direct `sphereId`. Never both explicitly — if `projectId` is set, sphere is always derived at query time via `getTaskSphereId`.

### ID types

All IDs are branded strings (`TaskId`, `ProjectId`, `SphereId`, `EventId`) generated with nanoid. The brands are compile-time only — at runtime they are plain strings.

### packages/query

Shared, environment-agnostic read query engine sitting on top of `packages/core`'s `query.ts` primitives. It is the single source of truth for filtering/sorting/pagination/name-resolution/JSON-shaping consumed by both `packages/mcp` (which serializes its output to text) and `packages/hooks` (which returns it straight to React) — no query or aggregation logic is duplicated between the two UI surfaces.

```
src/
  runQuery.ts   — ParsedCommand (discriminated union) + runQuery(state, command, opts?) → plain object
  resolve.ts    — name→id resolution: exact id → case-insensitive exact name → case-insensitive substring
  serialize.ts  — TaskJson/ProjectJson/SphereJson/AgendaJson/ContextJson: denormalizes sphere/project/
                  agenda/context onto each entity as {id,name} EntityRefs
  views.ts      — pure ProjectionState-only aggregate view functions backing the dashboard/processing/
                  waiting/pick_list command kinds (see below)
  search.ts     — searchAll(state, query, opts?): MiniSearch-backed full-text search over task
                  titles/descriptions and project names/descriptions, backing the search command kind
  fixtures.ts   — test-only entity builders (makeSphere/makeProject/makeTask/etc., buildState)
```

`ParsedCommand` kinds: `tasks`, `task`, `spheres`, `agendas`, `contexts` (the original CLI-era surface, filters matching `core/query.ts`'s `TaskFilter` field-for-field, plus `dueOn`/`dueBefore`/`limit`), `projects` (same CLI-era surface, called out below for its `includeNextTasks` option), four aggregate views ported from the old interactive TUI's view model, with no equivalent anywhere else in the codebase, and `search`:

- **`projects`** — `{ kind: 'projects', sphere?: string, archived?: boolean, all?: boolean, includeNextTasks?: boolean }`. `includeNextTasks` opts each returned `ProjectJson` into a `nextTasks: TaskJson[]` field (the project's open `isNext` tasks, normally zero or one but not enforced as such) — omitted from the response entirely when the flag isn't passed, an empty array when passed but the project has no next action, so callers can distinguish "didn't ask" from "asked and there's nothing." Backed by `serialize.ts`'s `computeProjectNextTasks(state)`, a `Map<ProjectId, Task[]>` companion to `computeProjectStats` — `views.ts`'s `processingBuckets` also uses it (for `projectsWithoutNext`) rather than re-deriving the same "open + isNext + has a project" predicate inline. When `includeNextTasks` is requested, `runQuery.ts`'s `projects` handler calls `computeProjectStatsAndNextTasks(state)` instead, a single-pass sibling that fills both maps in one scan over `state.tasks` rather than running `computeProjectStats` and `computeProjectNextTasks` back to back; the plain `computeProjectStats(state)` alone still covers the common case where next tasks weren't asked for.
- **`dashboard`** — `{ kind: 'dashboard', sphere: string, limit?: number }`. **`sphere` is required** — there is no "across all spheres" mode. Open tasks in that sphere where `dueDate <= today OR isStarred`, overdue/due-today sorted ascending before non-date-qualifying starred tasks.
- **`processing`** — `{ kind: 'processing' }`. **Takes no sphere at all** — always aggregates across every sphere. Returns three buckets: `actionableTasks` (actionable, not waiting, no due date/agenda/context), `projectsWithoutNext` (active projects with no open `isNext` task), `tasksWaitingOnArchivedProjects` (waiting tasks pointing at an archived or missing project).
- **`waiting`** — `{ kind: 'waiting', sphere?: string }`. Sphere optional, unscoped (all spheres) when omitted. Open+waiting tasks grouped by `waitingFor.kind`, fixed order `review, agenda, project, trello`, empty groups omitted.
- **`pick_list`** — `{ kind: 'pick_list', sphere: string }`. **`sphere` is required**, same as `dashboard`. Actionable tasks with a context in that sphere, grouped by context in the sphere's context order.
- **`search`** — `{ kind: 'search', query: string, sphere?: string, includeArchived?: boolean, limit?: number }`. Full-text search over open tasks (title + description) and active projects (name + description), so a consumer — notably an LLM via `packages/mcp` — can find a specific task/project by keyword without listing everything into context. Returns `{ count, total, truncated, results }` where each `results` entry is `{ kind: 'task', score, task: TaskJson } | { kind: 'project', score, project: ProjectJson }`, combined and ranked by relevance (title matches boosted 2× over description matches). `sphere` resolves via `resolve.ts` like the other commands; `includeArchived` includes tasks in archived projects and archived projects themselves, same convention as `tasks`' own `includeArchived`. A blank/whitespace-only `query` returns an empty result rather than throwing.

`search.ts`'s `searchAll(state, query, opts?)` caches the built `minisearch` index in a module-level `WeakMap<ProjectionState, Map<scopeKey, MiniSearch>>` — keyed on the `ProjectionState` object reference itself (nested by a `sphereId`/`includeArchived` scope key, since those change which docs get indexed), rather than rebuilding on every call like the rest of this otherwise-stateless package. This is safe because `core/store.ts`'s `PalimpsestStore.getState()` always re-projects the whole event log into a brand-new object — a given `ProjectionState` reference never mutates after the fact, so "same reference" reliably means "same data". The cache is a pure perf layer, not an additional source of truth: a different call to `getState()` (e.g. a separate MCP tool invocation) gets a fresh object and therefore a cache miss — no benefit there, but no staleness risk either. The real payoff is `packages/hooks`, where `PalimpsestProvider` only produces a new `projState` reference when the store actually notifies of a change; the same reference is reused across every re-render in between (e.g. every keystroke of a find-as-you-type search box), so the index is built once and reused for the rest of that typing session. Search options are `{ prefix: true, fuzzy: 0.2 }` — `prefix` matches a partial word at the end of the query (e.g. `"groc"` matches `"groceries"`, enabling find-as-you-type in `packages/hooks`), `fuzzy` tolerates small typos.

Sphere/project/agenda/context filters are matched by name via `resolve.ts` (exact id → case-insensitive exact name → case-insensitive substring; zero or multiple matches throws with a candidate list) since `core/query.ts` itself stays ID-based.

### packages/todoist

`TodoistStore` (extends `packages/core`'s `PollingStore`) is the `PalimpsestStore` backing every
Todoist-connected consumer (`packages/mcp`, `packages/hooks`'s `todoistToken` convenience prop).

Project descriptions round-trip like every other project field: `SyncProject.description` (added to
Todoist's project object after this integration was first built) is mapped onto core's
`Project.description` in `read.ts`'s `buildPalimpsestProjects`/`buildEvents`/`buildDeltaEvents`, and
`write.ts`'s `project.updated` case sends it back via `project_update`'s `description` arg (`CLEAR` →
`''`, matching how Todoist itself represents "no description"). Unlike `task.updated`'s patch (which
diffs every field against the existing task), `project.updated`'s delta patch has never diffed —
`name`/`sphereId`/`description` are rebuilt unconditionally from whatever `deltaProjects` contains, on
the assumption that Todoist's sync response only includes a project in the delta when something on it
actually changed.

`mapping.ts`'s `todoistTaskUrl(taskId)` mirrors the existing `todoistProjectUrl(projectId)` — both are
pure `id → https://todoist.com/app/{task,project}/{id}` builders, valid because `TodoistStore` never
translates IDs: a palimpsest `Task`/`Project` id *is* the Todoist item/project id verbatim. Deliberately
not added as a field on core's `Task`/`Project` or on `packages/query`'s `TaskJson`/`ProjectJson` —
both are store-agnostic (`packages/hooks` also supports a non-Todoist backend store, where a Todoist URL
would be meaningless) — so instead `urls.ts`'s `attachTodoistUrls(value)` walks an arbitrary `runQuery()`
result (single task, lists, dashboard/waiting/pick_list groups — any shape, at any nesting depth) and
adds a `todoistUrl` to every task-shaped and project-shaped object it structurally finds (fingerprinted
by field presence, e.g. `waitingFor`+`isNext` for tasks, `openTaskCount`+`hasNextAction` for projects,
since this package doesn't depend on `packages/query` and so can't check against `TaskJson`/`ProjectJson`
nominally). Each Todoist-aware consumer opts in for itself: `packages/mcp`'s `runToolQuery`/
`runToolMutation` call it unconditionally (mcp only supports the Todoist store); `packages/hooks`'
`internal/useRunQuery.ts` calls it only when `store instanceof TodoistStore`, since a `store` prop can
also be a non-Todoist `PalimpsestStore` (e.g. `ClientPalimpsestStore`).
`readAllEvents()` returns `[...baseEvents, ...pending]` — `baseEvents` from the last successful sync,
`pending` from `PollingStore`'s in-memory-by-default queue of locally-appended, not-yet-flushed events.
`sync()` converts `pending` into Todoist Sync API commands via `write.ts`'s `buildCommands` (one
`PalimpsestEvent` type → one or more commands each, e.g. `task.completed` → `item_close`,
`task.recurred` → `item_update_date_complete` with `is_forward: 1` so a recurring task's next
occurrence advances in Todoist too rather than closing it), POSTs them alongside the stored
`syncToken`, and on success clears `pending` and folds the response into `baseEvents`. On failure it
sets `syncState.health = 'error'` and `syncState.lastError` instead of rejecting — callers awaiting
`sync()`/`refresh()` see a normal return, not a thrown error, and check `syncState` if they need to know
whether it actually flushed (see `packages/mcp`'s `handleCompleteTask` below).

**`api.ts`'s `post()` applies a 20s timeout (`AbortController`) to every Sync API request.** Without
it, a stalled connection leaves `fetch()`'s promise unsettled forever — since `PollingStore.refresh()`
guards against overlapping syncs with a single `syncing` boolean that only resets in `sync()`'s
`finally`/return path, a hung request never resets it, so every subsequent sync attempt (the periodic
poll included) silently no-ops indefinitely with no visible error, and any pending writes queue up
without ever flushing. The timeout converts a hang into a normal rejection, which `sync()`'s existing
catch already turns into a visible `health: 'error'` + `lastError`, letting `refresh()`'s `finally`
reset `syncing` so the next poll can retry.

**Converting `pending` events to commands (`buildAllCommands`, called from `sync()`) is wrapped in its
own try/catch, separate from the network call's.** `buildCommands` can throw for a given event (e.g.
`task.recurred` looks its task up in the *last-synced* base state, not the pending-inclusive state
`appendEvents` validated against — so recurring the same not-yet-synced task twice, or any other event
whose conversion depends on state `pending` itself hasn't reached yet, throws "task not found"). Before
this was split out, that exception propagated straight out of `sync()`, before ever reaching the network
try/catch below it — meaning `health`/`lastError` never got set (that assignment only happens in a
catch block the throw skipped entirely) and the network call was never attempted. Worse, since the
offending event is never dequeued (only a successful POST clears `pending`), the exact same throw
recurs on every later call to `sync()` too — the periodic poll and manual refreshes alike — permanently,
with nothing to distinguish it from a sync that simply was never attempted. Catching it separately and
setting `health`/`lastError` the same way the network catch does turns a silent permanent wedge into a
visible (if not automatically recoverable) error.

**`write.ts`'s `uuid()` (used for every Sync API command's idempotency `uuid` field) falls back to
building an RFC4122 v4 UUID from `crypto.getRandomValues()` when `crypto.randomUUID` isn't a
function.** Hermes (React Native's JS engine) doesn't implement `crypto.randomUUID` even with
`react-native-get-random-values` installed — that polyfill only covers the older
`crypto.getRandomValues`, a separate Web Crypto API method. Calling the missing one throws "undefined
is not a function", and since every single command build calls `uuid()`, this broke *every* write in a
bare React Native app outright — surfaced by the `buildAllCommands` try/catch above as `health: 'error'`
with exactly that message, once that catch existed to report it at all. The read path has no equivalent
call, so polling alone never exercised this and looked completely healthy. Vitest's Node environment
has `crypto.randomUUID` natively, so this needs an explicit `vi.stubGlobal('crypto', { getRandomValues
})` test to reproduce — nothing in the existing suite exercised the "missing" branch before this bug was
found.

### packages/mcp

A local MCP server over the stdio transport, for use by MCP clients (e.g. Claude Desktop, Claude Code). Exposes eleven read-only tools mirroring `@alnorth/palimpsest-query`'s `ParsedCommand` kinds one-for-one (`tasks`, `task`, `projects`, `spheres`, `agendas`, `contexts`, `dashboard`, `processing`, `waiting`, `pick_list`, `search`) plus three write tools — `complete_task`, `set_due_date`, `delete_task` — a small but growing set alongside the read ones.

```
src/
  index.ts        — entry point: builds the store, connects McpServer over StdioServerTransport
  server.ts       — createMcpServer(store): registers the 14 tools with zod input schemas
  tools.ts        — pure per-tool handlers: read handlers map args → ParsedCommand and call runQuery;
                    write handlers (handleCompleteTask/handleSetDueDate/handleDeleteTask) map args →
                    a core command → store.appendEvents, via the shared runToolMutation scaffolding
  store.ts        — createStore(env): builds a TodoistStore from PALIMPSEST_TODOIST_TOKEN
```

Only supports the Todoist store for now, so the only credential needed is the Todoist API token, read from the `PALIMPSEST_TODOIST_TOKEN` environment variable at startup (set it in the MCP client's server config, e.g. `{ "command": "palimpsest-mcp", "env": { "PALIMPSEST_TODOIST_TOKEN": "..." } }`). `createStore` throws a readable error (caught in `index.ts`, printed to stderr, exit `1`) if the token is missing.

The store is built once at startup; each read tool call runs `store.sync()` (an incremental Todoist sync) before `store.getState()`, so results stay fresh without re-authenticating per call. Each read handler in `tools.ts` maps its zod-validated input onto a `ParsedCommand` from `@alnorth/palimpsest-query` and calls the shared `runQuery`. Success returns `{ content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }) }] }`; a thrown domain error (unresolved name, unknown task id) or a failed sync is caught and returned as `{ content: [...], isError: true }` with the error message as the text — never a thrown protocol error. `dashboard` and `pick_list` require `sphere` in their input schema (no `.optional()`); `processing` takes an empty schema; `search` requires `query`.

`search` is the tool this server exists to make unnecessary to work around: without it, finding a specific task or project meant listing everything into context (via `tasks`/`projects`) and scanning client-side. `handleSearch`/`search` map straight onto `@alnorth/palimpsest-query`'s `search` command kind (see packages/query section above) — full-text, prefix- and typo-tolerant, ranked by relevance, tasks and projects combined in one result list.

All three write handlers take a plain task `id` — no name resolution, unlike the collection filters, since a wrong fuzzy match on a *write* is a much worse failure mode than on a read. They share `runToolMutation(store, taskId, buildEvents)`: sync → look up the task via core's `getTask` (throws `Task not found: ...` if missing) → `buildEvents(task)` to get the event(s) to append (`completeTask` → `task.completed`, or `task.recurred` if the task carries a `dueDateExpression`; `updateTask(task, { dueDate })` → `task.updated`; `deleteTask` → `task.deleted`) → `appendEvents` → a second `store.sync()` to flush the pending event through immediately rather than leaving it for `PollingStore`'s debounced sync → re-read state → `runQuery(..., { kind: 'task', id })`. `TodoistStore.sync()` swallows network failures internally (sets `syncState.health` to `'error'` instead of rejecting), so a failed flush looks identical to a successful one from the handler's `await` alone — `runToolMutation` checks `store.syncState` afterwards and reports `synced: false` plus a `warning` string when the flush didn't actually confirm, rather than silently claiming confirmation that didn't happen. The write itself already succeeded at that point (`appendEvents` resolved), so this is reported as an unsynced success (`ok: true, synced: false`), not a tool error.

`set_due_date`'s `dueDate` input is `string | null` — a string (`"today"` or an ISO `YYYY-MM-DD`, resolved by a local `resolveDueDate` helper mirroring `@alnorth/palimpsest-query`'s `resolveDateArg`) to set it, or `null` to clear it via core's `CLEAR` sentinel. There is no dedicated core command for this — it goes through the generic `updateTask(task, { dueDate })` patch, same as `postponeTask` does internally. `delete_task` and `set_due_date` both fail (via `updateTask`/`deleteTask`'s own guards) if the task isn't in a valid state for the change — e.g. `set_due_date` on a completed/deleted task, or `delete_task` on an already-deleted one — surfaced the same way as `complete_task`'s "already completed" guard.

`tools.ts`'s `TaskStore` interface (`{ sync(): Promise<void>; getState(): Promise<ProjectionState>; appendEvents(events: PalimpsestEvent[]): Promise<void>; syncState?: SyncState }`) is a minimal structural type, not tied to any concrete store class — this keeps the handlers unit-testable against a fake without needing a real `TodoistStore`/`PollingStore`. `syncState` is optional since only `PollingStore`-backed stores expose it (mirroring the same `'syncState' in store` duck-typing `packages/hooks`' `PalimpsestProvider` already uses). `TodoistStore` already implements `appendEvents` (inherited from `PollingStore`/`PalimpsestStore`), so no store-layer changes were needed to add the write tool.

### packages/hooks

React hooks + a Context for reading — and, starting with task completion, writing — palimpsest data from arbitrary third-party React apps (web, React Native, etc.). Built on `@alnorth/palimpsest-query` (same filter vocabulary and denormalized JSON shapes as `packages/mcp`, so the two remaining UI surfaces stay aligned). `PalimpsestProvider`'s `todoistToken` prop is a convenience that builds a `@alnorth/palimpsest-todoist` `TodoistStore` (zero Node dependencies, `fetch`-based, safe in any bundler); its `store` prop accepts any `PalimpsestStore`, including this package's own `ClientPalimpsestStore` (synced against `packages/backend`'s custom `/sync` API — the same backend `packages/cdk` deploys — for projects that want their own infrastructure instead of relying on Todoist) paired with `LocalStoragePendingEventStore` for the browser-local pending-write buffer.

```
src/
  PalimpsestProvider.tsx        — Context + Provider: fuses the connect phase (store.init() → getState())
                                  with the live-update phase (store.subscribe()/start()/stop()); exposes
                                  store, projState, isLoading, connectionError, syncState, refresh,
                                  currentSphereId/setCurrentSphere, today
  useStore.ts                   — lower-level subscribe/poll hook over an already-known ProjectionState
  ClientPalimpsestStore.ts       — PalimpsestStore synced against a custom backend's POST /sync endpoint
                                  (SyncFn injected by the caller); alternative to @alnorth/palimpsest-todoist's TodoistStore
  LocalStoragePendingEventStore.ts — PendingEventStore backed by browser localStorage, pairs with the above
  internal/useRunQuery.ts       — shared memoized runQuery(projState, command) wrapper every read hook uses
  internal/useMutation.ts       — shared store.appendEvents(...) wrapper every write hook uses, exposing
                                  { mutate, isPending, error }; the write-side sibling of useRunQuery
  internal/requireTask.ts       — shared getTask(projState, id) + "Task not found" guard every write hook uses
  use*.ts                       — one hook per read/write capability (see below)
  presentation/                 — opt-in display/formatting helpers operating on TaskJson (not ProjectionState)
```

Read hooks: `useSpheres`, `useAgendas`, `useContexts`, `useProjects`, `useTasks`, `useTask`, `useDashboard`, `useProcessing`, `useWaiting`, `usePickList`, `useSearch`, `useSyncStatus`, `useCurrentSphere`. Every read hook returns a consistent envelope — `QueryResult<T>` (`{ data, isLoading, error }`) for single-value/aggregate results, `ListResult<T>` (adds `total`/`truncated`) for paginated lists — and returns plain denormalized `TaskJson`/`ProjectJson`/etc., never pre-formatted strings.

`useSearch(query, filter?)` is the one read hook whose first argument is a plain string rather than a filter object, since it's built for find-as-you-type: pass the raw text-input value straight through on every keystroke, no debouncing needed. This is cheap specifically because of how `@alnorth/palimpsest-query`'s `search` command is cached (see `search.ts`'s `WeakMap` in the packages/query section above): `PalimpsestProvider`'s `projState` keeps the same object reference across every re-render until the store actually notifies of a change, so typing a query only ever re-runs a cheap `.search()` against an index built once at the start of that session, not a full MiniSearch rebuild per keystroke. `internal/useRunQuery.ts`'s existing `JSON.stringify(command)`-keyed memoization additionally skips recomputation entirely when the query string hasn't actually changed between renders. A blank/whitespace-only `query` passes `command: undefined` to `useRunQuery` (same as any other read hook with nothing to query yet) and returns an empty-but-valid `ListResult` (`{ data: [], isLoading: false, error: undefined, total: 0, truncated: false }`) — a fresh search box starts empty, not loading. `filter` is `{ sphere?, includeArchived?, limit? }`, mirroring the `search` command's own optional fields.

Write hooks: `useCompleteTask()`, `useSetDueDate()`, `useDeleteTask()` (more — `useCreateTask()`, etc. — are a planned later phase). Every write hook returns `MutationResult<TArgs, TResult>` (`{ mutate, isPending, error }`) from the shared `internal/useMutation.ts` primitive. `useCompleteTask()` and `useDeleteTask()` take no arguments and return `{ mutate: (taskId: string) => Promise<void>, isPending, error }` — the id varies per call rather than per hook instance, so one hook instance can complete/delete whichever row was just clicked in a list. `useSetDueDate()` returns `{ mutate: (args: SetDueDateArgs) => Promise<void>, isPending, error }` where `SetDueDateArgs` is `{ taskId: string; dueDate: string | null }` (`null` clears the due date via core's `CLEAR` sentinel — there's no dedicated core command for this, it's the same generic `updateTask(task, { dueDate })` patch the MCP `set_due_date` tool uses). Every `mutate` looks the task up fresh from the *current* `projState` (not a value captured at render time) via the shared `internal/requireTask.ts` helper (`getTask` plus the "Task not found" guard every write hook needs), then calls the matching core command (`completeTask`/`updateTask`/`deleteTask`) and `store.appendEvents(...)`. No hand-rolled optimistic local state is needed: `PollingStore`-based stores already fold pending (unsynced) events into every `getState()` projection, so the Provider's existing `subscribe`→`getState()`→re-render loop reflects the write as soon as `appendEvents` resolves, well before the debounced network sync completes.

`useMutation`'s `mutate` is wrapped in `useCallback([store, projState, fn])`, so each write hook's `fn` must be a stable reference (module-level, not an inline closure defined inside the hook body) or the memoization is defeated and `mutate` gets a new identity every render regardless of whether `store`/`projState` actually changed. `useCompleteTask`, `useSetDueDate`, and `useDeleteTask` all follow this by defining their mutation logic as a top-level `runCompleteTask`/`runSetDueDate`/`runDeleteTask` function and passing that reference to `useMutation`, rather than an inline arrow function — later write hooks should do the same.

Filter param shapes mirror `@alnorth/palimpsest-query`'s `ParsedCommand` fields exactly (same sphere/project/agenda/context/status/etc. vocabulary as the MCP tools), with one exception: **sphere-scoping for the four aggregate hooks is split by hook family**. `useTasks`/`useProjects`/`useAgendas`/`useContexts` stay fully parameterized — an omitted `sphere` never falls back to context state. `useWaiting` mirrors its MCP tool (`sphere` optional, unscoped when omitted). `useDashboard`/`usePickList` mirror their MCP tools' required-`sphere` constraint, but satisfy it at the hook layer by falling back to the Context's `currentSphereId` when their own argument is omitted — if neither resolves, they return an empty-but-valid result (`{ data: [], isLoading: false, error: undefined, ... }`), never an error. `useProcessing` takes no sphere argument at all, matching its MCP tool's always-global scope.

`presentation/taskDisplay.ts` (`getDueStatus`, `hasDescription`, `getTaskBadges`, `getTaskDetailFields`) operates on `TaskJson` rather than raw `Task`+`ProjectionState`, and badges carry a `kind` discriminant (`'description'|'waiting'|'project'|'agenda'|'context'|'dueDate'|'recurrence'|'completedAt'`) rather than a pre-rendered prefix glyph, so different renderers (web, React Native) can style each kind however they like. A dangling `waitingFor` reference (the waited-on agenda or project has been deleted/archived) denormalizes to `name: null` in `@alnorth/palimpsest-query`'s `WaitingForJson` rather than throwing or silently showing a blank name; `taskDisplay.ts` renders this as a `?` placeholder (`w/ ?` badge, `?` detail-field value) so it's visibly distinct from a resolved name. `presentation/previews.ts` carries `getDueDatePreview`/`getRecurrencePreview` (due-date/recurrence input preview helpers, unused today but salvaged for the future write-support phase) alongside `formatDateWithDay`.

The Context exposes `store: PalimpsestStore` directly (not hidden), which is what lets `internal/useMutation.ts` call `store.appendEvents(...)` and rely on the same `subscribe`→`getState` refresh loop already wired into the Provider, without needing a breaking Context-shape change for write support.

### packages/backend

AWS Lambda (Node.js 22.x) providing a single `POST /sync` endpoint. Built as an ESM bundle via tsup (AWS SDK externalized, `@alnorth/palimpsest` core bundled in).

```
src/
  handlers/
    handler.ts        — Lambda entry point: CORS headers, routing, secret caching
    handleSync.ts     — sync logic: validate, conflict-check, append, return missed events
  auth/
    verify.ts         — Bearer token validation against cached Secrets Manager value
  store/
    schema.ts         — DynamoDB item shapes and key structure
    DynamoPalimpsestStore.ts — PalimpsestStore impl over DynamoDB; retries transact-write up to 3×
  conflict/
    analyze.ts        — conflict detection between submitted events and intervening server events
```

**`POST /sync` request/response:**
```
Request:  { clientSeq: number, events: PalimpsestEvent[] }
Response 200: { status: "ok", serverSeq: number, missedEvents: PalimpsestEvent[] }
Response 409: { status: "conflict", reason: string, serverSeq: number,
                missedEvents: PalimpsestEvent[], conflictingEvents: PalimpsestEvent[] }
```

**Sync algorithm:** If `clientSeq >= serverSeq`, append directly (fast path). Otherwise run `analyzeConflict()` against the intervening events — hard conflicts (e.g. updating a deleted task) return 409; safe divergences are appended and the client catches up via `missedEvents`.

**Conflict rules:** `task.updated`/`task.recurred` fail if the task was deleted or completed. `task.completed` and `task.deleted` are idempotent. `task.created` fails if the parent project was deleted. Project/agenda/sphere events never conflict.

**DynamoDB schema:**
- Events: `pk = "EVENTS"`, `sk = "{10-digit-seq}#{eventId}"` — attributes: `seq`, `type`, `entityType`, `entityId`, `payload` (JSON string)
- Metadata: `pk = "META"`, `sk = "sequence"` — attribute: `nextSeq`
- On-demand billing; point-in-time recovery enabled; removal policy RETAIN.

Auth secret lives in AWS Secrets Manager under secret name `palimpsest`, key `auth-token`. Fetched at Lambda cold start and cached in memory.

### packages/cdk

AWS CDK app (`app.ts`) that provisions the sync API stack in `eu-west-2` (no web hosting — there is no web app):

- **DynamoDB table** — `pk`/`sk` keys, on-demand, PITR enabled, RETAIN on stack deletion
- **Secrets Manager** — pre-existing secret `palimpsest` containing `auth-token` (must be created manually before first deploy)
- **Lambda** — 256 MB, 10 s timeout, env vars `TABLE_NAME` + `SECRET_NAME`
- **HTTP API Gateway** — `POST /sync` → Lambda; CORS open to all origins

Stack outputs: `ApiUrl`, `TableName`.

**Deploy order:** build backend → `npm run deploy --workspace=packages/cdk`. The `deploy:ci` script skips manual approval for CI pipelines.

### TypeScript strictness

`tsconfig.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. This means:
- Optional properties must be explicitly `undefined`-checked before access
- Array/Map index access returns `T | undefined`, not `T`
- Patch fields use `null` (CLEAR) rather than `undefined` for intentional removal
