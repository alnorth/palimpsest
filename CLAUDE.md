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
packages/core/     — the palimpsest library (published to npm / GitHub)
packages/query/    — shared read query engine (filter/sort/paginate/resolve/serialize) used by
                     both packages/mcp and packages/hooks — see packages/query section below
packages/todoist/  — PalimpsestStore backed by the Todoist Sync API (read + write mapping)
packages/mcp/      — local, read-only MCP server exposing the query engine's operations over
                     stdio, against a Todoist-backed store — see packages/mcp section below
packages/hooks/    — React hooks + Context library for reading palimpsest data from third-party
                     apps (web, React Native, etc.), read-only for now — see packages/hooks section below
packages/backend/  — AWS Lambda sync API (DynamoDB event store, conflict resolution)
packages/cdk/      — AWS CDK infrastructure (Lambda, API Gateway, DynamoDB)
```

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
  fixtures.ts   — test-only entity builders (makeSphere/makeProject/makeTask/etc., buildState)
```

`ParsedCommand` kinds: `tasks`, `task`, `projects`, `spheres`, `agendas`, `contexts` (the original CLI-era surface, filters matching `core/query.ts`'s `TaskFilter` field-for-field, plus `dueOn`/`dueBefore`/`limit`), and four aggregate views ported from the old interactive TUI's view model, with no equivalent anywhere else in the codebase:

- **`dashboard`** — `{ kind: 'dashboard', sphere: string, limit?: number }`. **`sphere` is required** — there is no "across all spheres" mode. Open tasks in that sphere where `dueDate <= today OR isStarred`, overdue/due-today sorted ascending before non-date-qualifying starred tasks.
- **`processing`** — `{ kind: 'processing' }`. **Takes no sphere at all** — always aggregates across every sphere. Returns three buckets: `actionableTasks` (actionable, not waiting, no due date/agenda/context), `projectsWithoutNext` (active projects with no open `isNext` task), `tasksWaitingOnArchivedProjects` (waiting tasks pointing at an archived or missing project).
- **`waiting`** — `{ kind: 'waiting', sphere?: string }`. Sphere optional, unscoped (all spheres) when omitted. Open+waiting tasks grouped by `waitingFor.kind`, fixed order `review, agenda, project, trello`, empty groups omitted.
- **`pick_list`** — `{ kind: 'pick_list', sphere: string }`. **`sphere` is required**, same as `dashboard`. Actionable tasks with a context in that sphere, grouped by context in the sphere's context order.

Sphere/project/agenda/context filters are matched by name via `resolve.ts` (exact id → case-insensitive exact name → case-insensitive substring; zero or multiple matches throws with a candidate list) since `core/query.ts` itself stays ID-based.

### packages/mcp

A local, read-only MCP server over the stdio transport, for use by MCP clients (e.g. Claude Desktop, Claude Code). No create/update/delete tools. Exposes ten tools mirroring `palimpsest-query`'s `ParsedCommand` kinds one-for-one: `tasks`, `task`, `projects`, `spheres`, `agendas`, `contexts`, `dashboard`, `processing`, `waiting`, `pick_list`.

```
src/
  index.ts        — entry point: builds the store, connects McpServer over StdioServerTransport
  server.ts       — createMcpServer(store): registers the 10 tools with zod input schemas
  tools.ts        — pure per-tool handlers: map tool args → ParsedCommand, call runQuery, wrap as CallToolResult
  store.ts        — createStore(env): builds a TodoistStore from PALIMPSEST_TODOIST_TOKEN
```

Only supports the Todoist store for now, so the only credential needed is the Todoist API token, read from the `PALIMPSEST_TODOIST_TOKEN` environment variable at startup (set it in the MCP client's server config, e.g. `{ "command": "palimpsest-mcp", "env": { "PALIMPSEST_TODOIST_TOKEN": "..." } }`). `createStore` throws a readable error (caught in `index.ts`, printed to stderr, exit `1`) if the token is missing.

The store is built once at startup; each tool call runs `store.sync()` (an incremental Todoist sync) before `store.getState()`, so results stay fresh without re-authenticating per call. Each handler in `tools.ts` maps its zod-validated input onto a `ParsedCommand` from `palimpsest-query` and calls the shared `runQuery`. Success returns `{ content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }) }] }`; a thrown domain error (unresolved name, unknown task id) or a failed sync is caught and returned as `{ content: [...], isError: true }` with the error message as the text — never a thrown protocol error. `dashboard` and `pick_list` require `sphere` in their input schema (no `.optional()`); `processing` takes an empty schema.

`tools.ts`'s `TaskStore` interface (`{ sync(): Promise<void>; getState(): Promise<ProjectionState> }`) is a minimal structural type, not tied to any concrete store class — this keeps the handlers unit-testable against a fake without needing a real `TodoistStore`/`PollingStore`.

### packages/hooks

React hooks + a Context for reading palimpsest data from arbitrary third-party React apps (web, React Native, etc.) — read-only for now; write support (`useCompleteTask()`, `useCreateTask()`, etc.) is a planned later phase. Built on `palimpsest-query` (same filter vocabulary and denormalized JSON shapes as `packages/mcp`, so the two remaining UI surfaces stay aligned) and `palimpsest-todoist`'s `TodoistStore` (zero Node dependencies, `fetch`-based, safe in any bundler).

```
src/
  PalimpsestProvider.tsx — Context + Provider: fuses the connect phase (store.init() → getState())
                           with the live-update phase (store.subscribe()/start()/stop()); exposes
                           store, projState, isLoading, connectionError, syncState, refresh,
                           currentSphereId/setCurrentSphere, today
  useStore.ts             — lower-level subscribe/poll hook over an already-known ProjectionState
  internal/useRunQuery.ts — shared memoized runQuery(projState, command) wrapper every data hook uses
  use*.ts                 — one hook per read capability (see below)
  presentation/           — opt-in display/formatting helpers operating on TaskJson (not ProjectionState)
```

Hooks: `useSpheres`, `useAgendas`, `useContexts`, `useProjects`, `useTasks`, `useTask`, `useDashboard`, `useProcessing`, `useWaiting`, `usePickList`, `useSyncStatus`, `useCurrentSphere`. Every data hook returns a consistent envelope — `QueryResult<T>` (`{ data, isLoading, error }`) for single-value/aggregate results, `ListResult<T>` (adds `total`/`truncated`) for paginated lists — and returns plain denormalized `TaskJson`/`ProjectJson`/etc., never pre-formatted strings.

Filter param shapes mirror `palimpsest-query`'s `ParsedCommand` fields exactly (same sphere/project/agenda/context/status/etc. vocabulary as the MCP tools), with one exception: **sphere-scoping for the four aggregate hooks is split by hook family**. `useTasks`/`useProjects`/`useAgendas`/`useContexts` stay fully parameterized — an omitted `sphere` never falls back to context state. `useWaiting` mirrors its MCP tool (`sphere` optional, unscoped when omitted). `useDashboard`/`usePickList` mirror their MCP tools' required-`sphere` constraint, but satisfy it at the hook layer by falling back to the Context's `currentSphereId` when their own argument is omitted — if neither resolves, they return an empty-but-valid result (`{ data: [], isLoading: false, error: undefined, ... }`), never an error. `useProcessing` takes no sphere argument at all, matching its MCP tool's always-global scope.

`presentation/taskDisplay.ts` (`getDueStatus`, `hasDescription`, `getTaskBadges`, `getTaskDetailFields`) operates on `TaskJson` rather than raw `Task`+`ProjectionState`, and badges carry a `kind` discriminant (`'description'|'waiting'|'project'|'agenda'|'context'|'dueDate'|'recurrence'|'completedAt'`) rather than a pre-rendered prefix glyph, so different renderers (web, React Native) can style each kind however they like. `presentation/previews.ts` carries `getDueDatePreview`/`getRecurrencePreview` (due-date/recurrence input preview helpers, unused today but salvaged for the future write-support phase) alongside `formatDateWithDay`.

The Context exposes `store: PalimpsestStore` directly (not hidden) so that future write hooks can call `store.appendEvents(commands.completeTask(...))` and rely on the same `subscribe`→`getState` refresh loop already wired into the Provider, without needing a breaking Context-shape change later.

### packages/backend

AWS Lambda (Node.js 22.x) providing a single `POST /sync` endpoint. Built as an ESM bundle via tsup (AWS SDK externalized, `palimpsest` core bundled in).

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
