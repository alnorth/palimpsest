# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep this file up to date.** When making structural changes to the codebase — new modules, changed data flow, new domain concepts, altered invariants — update the relevant sections of this file in the same commit.

**When tagging a release**, always bump the `version` field in the relevant `package.json` to match the tag before committing.

## Development approach

All development must follow a Test-Driven Development (TDD) approach: write failing tests first, then write the minimum code to make them pass, then refactor. Do not implement new functionality without a corresponding test written beforehand.

## Git workflow

Commit directly on `main`. Do not create feature branches or pull requests unless explicitly asked.

## Monorepo structure

This is an npm workspaces monorepo:

```
packages/core/     — the palimpsest library (published to npm / GitHub)
packages/ui-core/  — shared app logic: state machine, view models, commands hook (React, no Ink)
packages/cli/      — the palimpsest TUI (ink + react, depends on core and ui-core via workspace)
packages/web/      — the palimpsest web app (React + Mantine, Vite, depends on core and ui-core)
packages/backend/  — AWS Lambda sync API (DynamoDB event store, conflict resolution)
packages/cdk/      — AWS CDK infrastructure (Lambda, API Gateway, S3, CloudFront, DynamoDB)
```

Run `npm install` from the repo root before running typechecks or tests in a fresh environment — missing `node_modules` will cause spurious errors.

Run commands from the repo root, or `cd` into a package directory:

```bash
npm test                                              # run core tests (vitest)
npm run build --workspaces                            # build all packages
npm run typecheck --workspaces                        # typecheck all packages
npm run test --workspace=packages/core                # core tests only
npm run test:watch --workspace=packages/core          # core tests in watch mode
npm run test --workspace=packages/ui-core             # ui-core tests
npm run dev --workspace=packages/cli                  # run CLI dev server (tsx)
npm run build --workspace=packages/cli                # build CLI
npm run dev --workspace=packages/web                  # web app dev server (http://localhost:5173)
npm run build --workspace=packages/web                # production web bundle (dist/)
npm run test --workspace=packages/web                 # web tests
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

### packages/ui-core

Framework-agnostic app logic shared across TUI, web, and phone (all React surfaces).

```
types.ts      — View, Mode, NavState, UIState, Action, Command
reducer.ts    — uiReducer(UIState, UIAction) → UIState  (pure, no I/O)
viewModel.ts  — deriveViewModel(ProjectionState, UIState) → ViewModel
commands.ts   — getCommands(ViewModel) → Command[]  (context-sensitive)
useAppState.ts — React hook: owns PalimpsestStore, wires everything, exposes dispatch(Action)
```

`dispatch` accepts both `UIAction` (handled by reducer) and `DataAction` (calls core commands, appends to store, refreshes projection state). The CLI imports `useAppState` and is a thin rendering-and-keyboard layer.

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

### packages/web

React web app built with Vite and Mantine. It is a thin rendering layer over `ui-core`, mirroring the CLI's role.

```
src/
  App.tsx            — root: reads /config.json or prompts for API URL; manages auth token (localStorage)
  LoadedApp.tsx      — main shell: AppShell, header, footer, NavDrawer
  SetupScreen.tsx    — first-run config UI (API URL + auth token entry)
  useKeyboard.ts     — keyboard handler (arrow keys, letter shortcuts, Escape, Ctrl+K)
  components/
    TaskList.tsx     — task list with selection/hover
    TaskDetail.tsx   — single task view (inline editing of title, due date, recurrence, etc.)
    ProjectList.tsx  — project list view
    CommandBar.tsx   — footer input bar, adapts per mode
    NavDrawer.tsx    — mobile/sidebar sphere and view navigation
    Pickers.tsx      — modal pickers: due date, agenda, context, project
    SyncStatus.tsx   — sync status indicator
  stubs/
    node-fs.ts       — browser stub for node:fs (required because ui-core imports core's store.ts)
```

Auth token is stored in `localStorage` under `palimpsest_auth_token`. The API URL comes from `config.json` (injected by CDK at deploy time) or from the setup screen. All sync calls send `Authorization: Bearer <token>`.

Views: `dashboard` (starred + due today), `tasks` (all/completed per sphere), `projects`, `project` (tasks in one project), `processing` (inbox tasks + projects without a next action). Modes: `list`, `adding`, `editing-task`, `editing-description`, `editing-due-date`, `editing-recurrence`, `adding-project`, `editing-project`. Modal pickers overlay any view.

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

AWS CDK app (`app.ts`) that provisions the full stack in `eu-west-2`:

- **DynamoDB table** — `pk`/`sk` keys, on-demand, PITR enabled, RETAIN on stack deletion
- **Secrets Manager** — pre-existing secret `palimpsest` containing `auth-token` (must be created manually before first deploy)
- **Lambda** — 256 MB, 10 s timeout, env vars `TABLE_NAME` + `SECRET_NAME`
- **HTTP API Gateway** — `POST /sync` → Lambda; CORS open to all origins
- **S3 + CloudFront** — hosts the built web app; 404/403 → `index.html` for SPA routing; cache invalidated on each deploy
- **S3 deployment** — uploads `packages/web/dist` plus a generated `config.json` containing the API Gateway URL

Stack outputs: `ApiUrl`, `WebUrl`, `TableName`.

**Deploy order:** build backend → build web → `npm run deploy --workspace=packages/cdk`. The `deploy:ci` script skips manual approval for CI pipelines.

### TypeScript strictness

`tsconfig.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. This means:
- Optional properties must be explicitly `undefined`-checked before access
- Array/Map index access returns `T | undefined`, not `T`
- Patch fields use `null` (CLEAR) rather than `undefined` for intentional removal
