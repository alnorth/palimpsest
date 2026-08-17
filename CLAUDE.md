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

Internal `@alnorth/*` dependencies (e.g. `packages/query`'s dependency on `@alnorth/palimpsest`,
`packages/hooks`'s on `@alnorth/palimpsest-query`/`@alnorth/palimpsest-todoist`) are committed as `"*"`
in every `packages/*/package.json` — inside the monorepo npm workspaces symlinks to local source
regardless of range, so `"*"` is harmless there and needs no manual bumping. These `package.json` files
are published verbatim to GitHub Packages, though, and a `"*"` range would give external consumers (e.g.
`cockpit`) no floor and no ceiling on the depended-on package — so `scripts/sync-internal-versions.mjs`
rewrites every `@alnorth/*` range to `^<current version>` of that dependency (reading each dependency's
own `version` field), and `publish-packages.yml` runs it (`npm run sync-internal-versions`) right before
the `npm publish` steps, after typecheck/test/build have already run against the committed `"*"` ranges.
This means the `package.json` actually published to GitHub Packages always differs from what's committed
on `main` (published ranges are real caret ranges; committed ranges are `"*"`) — that divergence is
expected and permanent, not just a between-bumps gap, since the published artifact is what external
consumers see and the committed source is never meant to carry real ranges.

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

**`pendingEventStore.ts`** — `PendingEventStore` is the interface `PollingStore`-based stores use to persist not-yet-synced events. Its `save()` contract requires implementations that can detect a concurrent writer (e.g. `packages/hooks`' `LocalStoragePendingEventStore`, shared across browser tabs via `localStorage`) to throw `ConcurrentModificationError` rather than silently clobbering the other writer's data — a blind `load()`-then-`save()` has no atomicity across two separate JS realms. `updatePending(store, compute)` is the read-modify-write helper every caller (`PollingStore.doAppend`, `ClientPalimpsestStore.sync()`, `TodoistStore.sync()`) uses instead of calling `save()` directly after `load()`: it retries `compute()` against a fresh `load()` whenever `save()` reports a conflict, up to a small retry cap. `MemoryPendingEventStore` never throws (single JS realm, no concurrent writer possible), so `updatePending` is a no-op wrapper for it.

**`pollingStore.ts`** — `PollingStore.doAppend` goes through `updatePending` (see above) rather than a raw load+save, so two tabs appending around the same moment both survive instead of one clobbering the other. `start()`/`stop()` also register/unregister a `window` `'storage'` event listener (browser-only, a no-op elsewhere) that calls `notify()` — this is how a tab picks up another same-origin tab's local writes immediately rather than waiting for the next poll tick or a visibility change.

**`query.ts`** — Stateless read functions over `ProjectionState`. `getTaskSphereId(state, task)` is the key derived helper: tasks may belong to a sphere directly (`task.sphereId`) or inherit it from their project (`task.projectId → project.sphereId`).

**`dateParser.ts`** — Two sections with a shared two-phase structure (parse input → discriminated union, then compute):
- *Due date parsing*: `parseDueDate(input, today)` accepts natural language (`"tomorrow"`, `"next monday"`, `"jan 15"`, `"25/12"`, ISO dates, etc.). Exports `addDays` and `nextWeekday` as utilities.
- *Recurrence*: `isValidExpression(expr)` and `nextDueDate(expr, completedAt)`. Expressions are stored verbatim as entered. Accepted forms: aliases (`"daily"`, `"weekly"`, `"monthly"`, `"quarterly"`, `"yearly"`, `"annually"`, `"fortnightly"`), `"every …"` / `"ev …"` patterns (`"every day"`, `"every monday"`, `"ev mon"`, `"every 15th"`, `"every month"`, `"every jan 1"`, `"every 2 weeks"`, etc.). All dates computed in UTC. Ordinal monthly day is capped at 1–28 to guarantee the day exists in every month.

### Domain model

- **Sphere** — top-level grouping (e.g. "Work", "Personal"). Every project, agenda, and project-less task must belong to one.
- **Project** — belongs to exactly one sphere. May optionally be linked to an agenda via `agendaId`
  (making it a "shared project"), or explicitly marked `isSelfOnly: true` ("just mine" — distinct
  from simply never having been linked at all, mirroring the dashboard app's own three-state
  "shared / just mine / never touched" distinction). `agendaId` and `isSelfOnly` are mutually
  exclusive — `updateProject` throws if a patch would leave both set (computed against *effective*
  values: the patch's own value if present, else the project's current one) — since they round-trip
  through the exact same one Todoist storage-blob entry (see packages/todoist below). Unlike
  `Task.agendaId` (deliberately loose — no cross-check against the task's own sphere),
  `Project.agendaId` enforces a same-sphere invariant: `validation.ts` rejects linking a project to
  an agenda belonging to a different sphere, and re-validates an existing link whenever a patch
  moves the project to a new sphere. This is a deliberate divergence from `Task.agendaId`, required
  because the dashboard app's own sharing UI only ever offers work-sphere projects paired with
  work-sphere agendas (+ "me") — a cross-sphere link written by palimpsest would be silently
  invisible there. The invariant only gates palimpsest's own write path (`appendEvents` →
  `validateBatch`); the read path folding Todoist data into state stays resilient to a pre-existing
  cross-sphere link found in the wild, consistent with `projection.ts`'s "stay resilient to invalid
  events" principle.
- **Agenda** — belongs to exactly one sphere; has only a `title` (no description). Tasks and
  projects may optionally be linked to one agenda via `agendaId`.
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

- **`projects`** — `{ kind: 'projects', sphere?: string, archived?: boolean, all?: boolean, agenda?: string, hasAgenda?: boolean, withoutAgenda?: boolean, isSelfOnly?: boolean, includeNextTasks?: boolean }`. `agenda`/`hasAgenda`/`withoutAgenda` mirror `tasks`' own agenda vocabulary exactly (name resolved via `resolveAgenda`, `hasAgenda`/`withoutAgenda` mapping onto core's single `ProjectFilter.hasAgenda` tri-state) — this is how a "shared project" (a project linked to an agenda) is queried; `ProjectJson` denormalizes the link as `agenda: EntityRef | null`, same pattern as every other optional FK. `isSelfOnly` filters on `Project.isSelfOnly` directly (`true` → only projects explicitly marked "just mine", `false` → only projects not so marked) — independent of the agenda filters, since a project can be linked to neither an agenda nor marked self-only at all (never touched by the sharing UI); `ProjectJson.isSelfOnly` is non-optional (`false` when unset), matching `TaskJson.isNext`/`isStarred`'s convention. There is no dedicated aggregate view for "shared projects" (e.g. grouped by agenda) — the extended `projects` command plus this `agenda` field is enough for a consumer to group client-side, and no second consumer needing that grouping exists in this codebase to justify centralizing it in `views.ts`. `includeNextTasks` opts each returned `ProjectJson` into a `nextTasks: TaskJson[]` field (the project's open `isNext` tasks, normally zero or one but not enforced as such) — omitted from the response entirely when the flag isn't passed, an empty array when passed but the project has no next action, so callers can distinguish "didn't ask" from "asked and there's nothing." Backed by `serialize.ts`'s `computeProjectNextTasks(state)`, a `Map<ProjectId, Task[]>` companion to `computeProjectStats` — `views.ts`'s `processingBuckets` also uses it (for `projectsWithoutNext`) rather than re-deriving the same "open + isNext + has a project" predicate inline. When `includeNextTasks` is requested, `runQuery.ts`'s `projects` handler calls `computeProjectStatsAndNextTasks(state)` instead, a single-pass sibling that fills both maps in one scan over `state.tasks` rather than running `computeProjectStats` and `computeProjectNextTasks` back to back; the plain `computeProjectStats(state)` alone still covers the common case where next tasks weren't asked for.
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

**Project↔agenda links ("shared projects") round-trip through a shared JSON-blob storage task,
not a native Todoist field — Todoist projects have no custom-field concept, and this reuses the
exact same mechanism the sibling (non-integrated) `/home/user/dashboard` app already uses for the
same purpose**, so the two apps stay interoperable on the same live Todoist data.
`packages/todoist/src/sharedStorage.ts` defines: `AGENDA_PROJECT_MAP_TASK_TITLE` — the exact magic
task content (`'* _AGENDA_PROJECT_MAPPING_'`) the dashboard's `useSharedProjectMapping.jsx` already
creates in Inbox (`TODOIST_INBOX_ID`) if missing; `findAgendaMapTask`/`parseAgendaMapping`/
`serializeAgendaMapping` — locate that task among raw Todoist items and parse/serialize its
`description` as fenced JSON (`` ```\n{...}\n``` ``, matching the dashboard's `useTodoistStorage.jsx`
format byte-for-byte); `resolveProjectSharing`/`labelForAgenda` — translate the blob's
`{ [todoistProjectId]: label }` dictionary into `{ agendaIds, selfOnlyProjectIds }` (a project's
label resolves to a real `AgendaId` via the **already-existing** `LABEL_TO_AGENDA_ID`/
`AGENDA_ID_TO_LABEL` maps in `mapping.ts`, or — for `SELF_AGENDA_LABEL` — into `Project.isSelfOnly`
instead; a genuinely unrecognized/typo label lands in neither outcome). `SELF_AGENDA_LABEL`
(`'me'`) is the dashboard's sentinel for "not shared — just mine," a deliberate, permanently-
unmapped label (not a person, so it never gets an `AgendaId`) — it's tracked as its own outcome
(`Project.isSelfOnly`) rather than dropped or conflated with a genuinely unrecognized label, since
"explicitly personal" and "never touched by the sharing UI at all" are different states (see
`Project.isSelfOnly` in the domain model above). `DASHBOARD_STORAGE_TASK_TITLES` generalizes the
one-title exclusion to every hidden storage task the dashboard's `useTodoistStorage` mechanism
creates in Inbox — the agenda-mapping one plus five others (GitHub PR cache, starred items,
project-overview mapping, daily basics, daily checklist) — `read.ts` excludes all six from ever
becoming spurious visible tasks, not just the agenda-mapping one.

`buildPalimpsestTask` also ignores any item with a non-null `parent_id` — a Todoist sub-task —
before doing any sphere/project resolution, so sub-tasks never become palimpsest `Task`s via either
`buildEvents` (initial load) or `buildDeltaEvents` (incremental sync). This reuses the same
"return `undefined` to skip" convention already used for a task whose sphere can't be resolved:
`buildEvents` simply omits the `task.created`, and `buildDeltaEvents` treats an already-tracked task
that later gains a `parent_id` the same as any other now-unresolvable task — it's left alone in
state rather than actively deleted, consistent with `projection.ts`'s "stay resilient" principle.
`SyncItem.parent_id` is `string | null` and always present in the Sync API's `items` payload
(`null` for a top-level item), so no extra `resource_types`/field request is needed to read it.

`read.ts`'s `buildEvents`/`buildDeltaEvents` compute the resolved mapping once per sync and fold it
into `project.created`/`project.updated` events the same way `description`/`sphereId` already are;
the map task itself is explicitly excluded from ever becoming a spurious palimpsest task. Because
the mapping can change without the linked project itself appearing in a given delta (someone only
edited the shared storage task), `buildDeltaEvents` also diffs every current project's `agendaId`
against a freshly-parsed mapping when the map task itself is in `deltaItems`, emitting
`project.updated` patches for whichever projects changed. `write.ts`'s `project.updated` case takes
an optional `BuildCommandsContext` (`{ rawAgendaMapping, agendaMapTaskId? }`) to read-modify-write
just one entry in the current mapping — `item_add` (creating the task in Inbox) if no map task is
known yet, `item_update` otherwise — and returns the resulting mapping/temp-id back to the caller
(`agendaMappingAfter`/`agendaMapTaskTempId`) so `TodoistStore`'s `buildAllCommands` can thread it
forward within one flush: multiple agenda-link changes queued before a single sync all land
correctly in the final blob, rather than each one overwriting the others based on the same
start-of-flush snapshot (a brand-new map task created mid-batch is referenced by later commands via
its `temp_id`, the same substitution mechanism already used for cross-referencing a project created
earlier in the same batch). `TodoistStore` itself caches the last-known `rawAgendaMapping`/
`agendaMapTaskId`, refreshed from whatever sync response most recently included the map task (full
syncs always include it if present; delta syncs only when it changed) and carried forward
otherwise — mirroring how `baseEvents` itself accumulates. This still leaves a known,
accepted-not-fixed race: two independent writers (two palimpsest instances, or palimpsest and the
dashboard app, or two open dashboard tabs) doing a concurrent read-modify-write on the same shared
blob can clobber each other's change — the same weakness `useTodoistStorage.jsx` already has with
itself, not a new risk this integration introduces.

`Project.agendaId` and `Project.isSelfOnly` round-trip through the exact same one mapping entry per
project (`agendaId` → the agenda's Todoist label, `isSelfOnly: true` → `SELF_AGENDA_LABEL`, neither/
false → the entry absent), so `write.ts`'s `project.updated` case fires on *either* field being
patched and resolves the one label with `isSelfOnly` checked first: core's mutual-exclusivity guard
prevents a hand-authored patch from setting both positively, but `buildDeltaEvents`'s unconditional
per-project rebuild routinely sends `{ agendaId: CLEAR, isSelfOnly: true }` together — not a
contradiction ("make this self-only" already implies "no agenda") — and the precedence order
resolves that combination to `"me"` rather than misreading it as a conflict. `isSelfOnly: false`
alone only deletes the entry if it's currently `SELF_AGENDA_LABEL` — it must not clobber a real
agenda label a separate `agendaId` patch already put there, since a project can perfectly validly
carry an effective `isSelfOnly` of `false` while already linked to a real agenda (that's the normal
state for any shared project, not a conflict `updateProject` would ever reject).

Auditing this integration against the dashboard's actual behavior surfaced two further asymmetries,
both accepted rather than fixed: if the shared agenda-mapping task is ever accidentally marked
complete, the dashboard's own `useTodoistDb.jsx` drops it from its local task list and would fork
off a brand-new, empty mapping on its next write — a dashboard-side fragility only; palimpsest's own
`findAgendaMapTask` already ignores `checked` and stays correct either way. And both apps' blob
writes are a plain read-modify-write over a locally-cached copy with no optimistic concurrency — a
symmetric, already-known race on both sides, not a new one this integration introduces.

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
`syncToken`, and on success removes exactly the sent events by id (via `updatePending`, not a blind
`save([])`) and folds the response into `baseEvents` — an event another tab appended to the shared
`pendingStore` while this network round trip was in flight was never part of `pending` and must
survive to be picked up by the next sync, not get wiped out along with it. On failure it
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

A local MCP server over the stdio transport, for use by MCP clients (e.g. Claude Desktop, Claude Code). Exposes eleven read-only tools mirroring `@alnorth/palimpsest-query`'s `ParsedCommand` kinds one-for-one (`tasks`, `task`, `projects`, `spheres`, `agendas`, `contexts`, `dashboard`, `processing`, `waiting`, `pick_list`, `search`) plus four write tools — `complete_task`, `set_due_date`, `delete_task`, `set_project_agenda` — a small but growing set alongside the read ones.

```
src/
  index.ts        — entry point: builds the store, connects McpServer over StdioServerTransport
  server.ts       — createMcpServer(store): registers the 15 tools with zod input schemas
  tools.ts        — pure per-tool handlers: read handlers map args → ParsedCommand and call runQuery;
                    task write handlers (handleCompleteTask/handleSetDueDate/handleDeleteTask) map
                    args → a core command → store.appendEvents, via the shared runToolMutation
                    scaffolding; the one project write handler (handleSetProjectAgenda) uses the
                    structurally-identical runProjectToolMutation sibling instead (see below)
  store.ts        — createStore(env): builds a TodoistStore from PALIMPSEST_TODOIST_TOKEN
```

Only supports the Todoist store for now, so the only credential needed is the Todoist API token, read from the `PALIMPSEST_TODOIST_TOKEN` environment variable at startup (set it in the MCP client's server config, e.g. `{ "command": "palimpsest-mcp", "env": { "PALIMPSEST_TODOIST_TOKEN": "..." } }`). `createStore` throws a readable error (caught in `index.ts`, printed to stderr, exit `1`) if the token is missing.

The store is built once at startup; each read tool call runs `store.sync()` (an incremental Todoist sync) before `store.getState()`, so results stay fresh without re-authenticating per call. Each read handler in `tools.ts` maps its zod-validated input onto a `ParsedCommand` from `@alnorth/palimpsest-query` and calls the shared `runQuery`. Success returns `{ content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }) }] }`; a thrown domain error (unresolved name, unknown task id) or a failed sync is caught and returned as `{ content: [...], isError: true }` with the error message as the text — never a thrown protocol error. `dashboard` and `pick_list` require `sphere` in their input schema (no `.optional()`); `processing` takes an empty schema; `search` requires `query`.

`search` is the tool this server exists to make unnecessary to work around: without it, finding a specific task or project meant listing everything into context (via `tasks`/`projects`) and scanning client-side. `handleSearch`/`search` map straight onto `@alnorth/palimpsest-query`'s `search` command kind (see packages/query section above) — full-text, prefix- and typo-tolerant, ranked by relevance, tasks and projects combined in one result list. `projects` additionally accepts `agenda`/`hasAgenda`/`withoutAgenda`/`isSelfOnly`, the same filters `@alnorth/palimpsest-query`'s `projects` command exposes (see packages/query section above), for finding "shared projects" and explicitly-personal ones.

All four write handlers take a plain `id` (task or project) — no name resolution, unlike the collection filters, since a wrong fuzzy match on a *write* is a much worse failure mode than on a read; this applies equally to `set_project_agenda`'s `agendaId` argument (a raw id, not a name — an MCP client resolves it via the `agendas` tool first, the same way it already must for the target `id` itself). The three task write handlers share `runToolMutation(store, taskId, buildEvents)`: sync → look up the task via core's `getTask` (throws `Task not found: ...` if missing) → `buildEvents(task)` to get the event(s) to append (`completeTask` → `task.completed`, or `task.recurred` if the task carries a `dueDateExpression`; `updateTask(task, { dueDate })` → `task.updated`; `deleteTask` → `task.deleted`) → `appendEvents` → a second `store.sync()` to flush the pending event through immediately rather than leaving it for `PollingStore`'s debounced sync → re-read state → `runQuery(..., { kind: 'task', id })`. `TodoistStore.sync()` swallows network failures internally (sets `syncState.health` to `'error'` instead of rejecting), so a failed flush looks identical to a successful one from the handler's `await` alone — `runToolMutation` checks `store.syncState` afterwards and reports `synced: false` plus a `warning` string when the flush didn't actually confirm, rather than silently claiming confirmation that didn't happen. The write itself already succeeded at that point (`appendEvents` resolved), so this is reported as an unsynced success (`ok: true, synced: false`), not a tool error.

`set_project_agenda` (`{ id, agendaId?: string | null, selfOnly?: boolean }`, `null` clearing `agendaId` via `CLEAR`) is the one write tool operating on a `Project` instead of a `Task` — there's no singular `project` `ParsedCommand` kind to re-fetch through (only the plural `projects` list), so its `runProjectToolMutation` sibling assembles the response directly from `@alnorth/palimpsest-query`'s already-exported `toProjectJson`/`computeProjectStats` rather than inventing a query-command kind whose only purpose would be re-fetching one project. It's structurally identical to `runToolMutation`: sync → `getProject` (throws `Project not found: ...`) → `updateProject(project, { agendaId?, isSelfOnly? })` → `appendEvents` (surfacing core's own mutual-exclusivity throw as `isError: true` if the call sets both a non-null `agendaId` and `selfOnly: true` — `{ agendaId: null, selfOnly: true }` is not contradictory and is allowed through, same reasoning as core's check; and surfacing core's same-sphere validation error as `isError: true` if the target agenda is in a different sphere than the project) → flush sync → re-read → same `synced`/`warning` reporting.

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
  LocalStoragePendingEventStore.ts — PendingEventStore backed by browser localStorage, pairs with the above;
                                  detects a concurrent writer (another tab) and throws
                                  ConcurrentModificationError rather than clobbering it
  internal/useRunQuery.ts       — shared memoized runQuery(projState, command) wrapper every read hook uses
  internal/useMutation.ts       — shared store.appendEvents(...) wrapper every write hook uses, exposing
                                  { mutate, isPending, error }; the write-side sibling of useRunQuery
  internal/requireTask.ts       — shared getTask(projState, id) + "Task not found" guard every write hook uses
  internal/requireProject.ts    — same shape as requireTask.ts, for the project-side write hook (getProject + "Project not found")
  use*.ts                       — one hook per read/write capability (see below)
  presentation/                 — opt-in display/formatting helpers operating on TaskJson (not ProjectionState)
```

Read hooks: `useSpheres`, `useAgendas`, `useContexts`, `useProjects`, `useTasks`, `useTask`, `useDashboard`, `useProcessing`, `useWaiting`, `usePickList`, `useSearch`, `useSyncStatus`, `useCurrentSphere`. Every read hook returns a consistent envelope — `QueryResult<T>` (`{ data, isLoading, error }`) for single-value/aggregate results, `ListResult<T>` (adds `total`/`truncated`) for paginated lists — and returns plain denormalized `TaskJson`/`ProjectJson`/etc., never pre-formatted strings.

`useSearch(query, filter?)` is the one read hook whose first argument is a plain string rather than a filter object, since it's built for find-as-you-type: pass the raw text-input value straight through on every keystroke, no debouncing needed. This is cheap specifically because of how `@alnorth/palimpsest-query`'s `search` command is cached (see `search.ts`'s `WeakMap` in the packages/query section above): `PalimpsestProvider`'s `projState` keeps the same object reference across every re-render until the store actually notifies of a change, so typing a query only ever re-runs a cheap `.search()` against an index built once at the start of that session, not a full MiniSearch rebuild per keystroke. `internal/useRunQuery.ts`'s existing `JSON.stringify(command)`-keyed memoization additionally skips recomputation entirely when the query string hasn't actually changed between renders. A blank/whitespace-only `query` passes `command: undefined` to `useRunQuery` (same as any other read hook with nothing to query yet) and returns an empty-but-valid `ListResult` (`{ data: [], isLoading: false, error: undefined, total: 0, truncated: false }`) — a fresh search box starts empty, not loading. `filter` is `{ sphere?, includeArchived?, limit? }`, mirroring the `search` command's own optional fields.

Write hooks: `useCompleteTask()`, `useSetDueDate()`, `useDeleteTask()`, `useSetProjectAgenda()` (more — `useCreateTask()`, etc. — are a planned later phase). Every write hook returns `MutationResult<TArgs, TResult>` (`{ mutate, isPending, error }`) from the shared `internal/useMutation.ts` primitive. `useCompleteTask()` and `useDeleteTask()` take no arguments and return `{ mutate: (taskId: string) => Promise<void>, isPending, error }` — the id varies per call rather than per hook instance, so one hook instance can complete/delete whichever row was just clicked in a list. `useSetDueDate()` returns `{ mutate: (args: SetDueDateArgs) => Promise<void>, isPending, error }` where `SetDueDateArgs` is `{ taskId: string; dueDate: string | null }` (`null` clears the due date via core's `CLEAR` sentinel — there's no dedicated core command for this, it's the same generic `updateTask(task, { dueDate })` patch the MCP `set_due_date` tool uses). `useSetProjectAgenda()` is the project-side equivalent: `{ mutate: (args: SetProjectAgendaArgs) => Promise<void>, isPending, error }`, `SetProjectAgendaArgs` = `{ projectId: string; agendaId?: string | null; selfOnly?: boolean }` (`agendaId: null` clears via `CLEAR`, same `updateProject(project, { agendaId?, isSelfOnly? })` patch the MCP `set_project_agenda` tool uses; `agendaId` is a raw id, no name resolution, for the same reason the MCP tool takes a raw id). The `agendaId`+`selfOnly: true` mutual-exclusivity guard lives only in core's `updateProject` (not duplicated at this layer) — its throw surfaces via `useMutation`'s `error`/rejected-`mutate`-promise, same as `requireProject`'s "not found" throw; `{ agendaId: null, selfOnly: true }` is not contradictory and is allowed through. Every `mutate` looks the task/project up fresh from the *current* `projState` (not a value captured at render time) via the shared `internal/requireTask.ts`/`internal/requireProject.ts` helpers (`getTask`/`getProject` plus the "not found" guard every write hook needs), then calls the matching core command (`completeTask`/`updateTask`/`deleteTask`/`updateProject`) and `store.appendEvents(...)`. No hand-rolled optimistic local state is needed: `PollingStore`-based stores already fold pending (unsynced) events into every `getState()` projection, so the Provider's existing `subscribe`→`getState()`→re-render loop reflects the write as soon as `appendEvents` resolves, well before the debounced network sync completes.

`useMutation`'s `mutate` is wrapped in `useCallback([store, projState, fn])`, so each write hook's `fn` must be a stable reference (module-level, not an inline closure defined inside the hook body) or the memoization is defeated and `mutate` gets a new identity every render regardless of whether `store`/`projState` actually changed. `useCompleteTask`, `useSetDueDate`, `useDeleteTask`, and `useSetProjectAgenda` all follow this by defining their mutation logic as a top-level `runCompleteTask`/`runSetDueDate`/`runDeleteTask`/`runSetProjectAgenda` function and passing that reference to `useMutation`, rather than an inline arrow function — later write hooks should do the same.

Filter param shapes mirror `@alnorth/palimpsest-query`'s `ParsedCommand` fields exactly (same sphere/project/agenda/context/status/etc. vocabulary as the MCP tools), with one exception: **sphere-scoping for the four aggregate hooks is split by hook family**. `useTasks`/`useProjects`/`useAgendas`/`useContexts` stay fully parameterized — an omitted `sphere` never falls back to context state. `useWaiting` mirrors its MCP tool (`sphere` optional, unscoped when omitted). `useDashboard`/`usePickList` mirror their MCP tools' required-`sphere` constraint, but satisfy it at the hook layer by falling back to the Context's `currentSphereId` when their own argument is omitted — if neither resolves, they return an empty-but-valid result (`{ data: [], isLoading: false, error: undefined, ... }`), never an error. `useProcessing` takes no sphere argument at all, matching its MCP tool's always-global scope.

`presentation/taskDisplay.ts` (`getDueStatus`, `hasDescription`, `getTaskBadges`, `getTaskDetailFields`) operates on `TaskJson` rather than raw `Task`+`ProjectionState`, and badges carry a `kind` discriminant (`'description'|'waiting'|'project'|'agenda'|'context'|'dueDate'|'recurrence'|'completedAt'`) rather than a pre-rendered prefix glyph, so different renderers (web, React Native) can style each kind however they like. A dangling `waitingFor` reference (the waited-on agenda or project has been deleted/archived) denormalizes to `name: null` in `@alnorth/palimpsest-query`'s `WaitingForJson` rather than throwing or silently showing a blank name; `taskDisplay.ts` renders this as a `?` placeholder (`w/ ?` badge, `?` detail-field value) so it's visibly distinct from a resolved name. `presentation/previews.ts` carries `getDueDatePreview`/`getRecurrencePreview` (due-date/recurrence input preview helpers, unused today but salvaged for the future write-support phase) alongside `formatDateWithDay`.

The Context exposes `store: PalimpsestStore` directly (not hidden), which is what lets `internal/useMutation.ts` call `store.appendEvents(...)` and rely on the same `subscribe`→`getState` refresh loop already wired into the Provider, without needing a breaking Context-shape change for write support.

**Multiple tabs open against the same `LocalStoragePendingEventStore` key used to race.** `localStorage`
has no atomic read-modify-write primitive, and each tab holds its own `ClientPalimpsestStore` instance —
only the `localStorage` key itself is shared. Two tabs appending an event within the same debounce
window could both `load()` the same pending array before either wrote back, and whichever tab's `save()`
ran last silently overwrote the other tab's event with no error. `LocalStoragePendingEventStore.save()`
now tracks the raw string it last saw (from its own `load()`/`save()`) and throws
`ConcurrentModificationError` if `localStorage` has changed since — every caller that does a
load-then-save (`PollingStore.doAppend`, `ClientPalimpsestStore.sync()`'s post-sync cleanup,
`TodoistStore.sync()`'s post-sync cleanup) goes through core's `updatePending` helper, which retries
against a fresh `load()` on that error instead of clobbering.

`updatePending` also queues concurrent calls against the *same* `PendingEventStore` instance (a
per-instance `WeakMap<PendingEventStore, Promise<void>>` chain), not just across separate instances/tabs.
This matters because `LocalStoragePendingEventStore`'s conflict check compares against a single
"last observed" field on the instance itself — two overlapping `updatePending()` cycles on that one
instance (e.g. two `appendEvents()` calls fired without awaiting each other, within one tab) would
otherwise each pass their check against the *other* call's write and silently clobber it, reproducing
the exact same-tab-scoped version of the cross-tab bug this store exists to prevent. Serializing at the
`updatePending` level fixes it for every `PendingEventStore` implementation, not just this one.

`removeSentEvents(store, sent)` (core) is the shared helper both `ClientPalimpsestStore.sync()` and
`TodoistStore.sync()` use for post-sync cleanup: it removes only the events actually sent, by id, via
`updatePending` — not a blind `save([])` — so an event another tab appended while the network round trip
was in flight survives to be picked up by the next sync. Both callers wrap it in its own try/catch,
separate from the network call's: if `updatePending`'s retries are exhausted (sustained concurrent
writes), the throw is caught and reported as `health: 'error'` + `lastError`, same as a network failure,
rather than propagating uncaught out of `sync()`/`refresh()` — `ClientPalimpsestStore` additionally only
folds the sent events into `baseEvents` *after* `removeSentEvents` succeeds, so a failed cleanup attempt
doesn't double-count them in projected state on the next retry (they're still accounted for once, via
the pendingStore entries `readAllEvents()` also reads).

A `'storage'` event listener in `PollingStore` also means a backgrounded tab notices another tab's writes
immediately rather than only at its next poll tick. It only reacts when the event's `key` matches the
`PendingEventStore`'s own `key` (an optional field on the `PendingEventStore` interface, exposed by
`LocalStoragePendingEventStore`) — an unrelated same-origin `localStorage` write (another key, another
library) doesn't trigger a needless re-projection. A store with no `key` notion (e.g.
`MemoryPendingEventStore`) is treated as "always relevant" so existing non-browser behavior is unaffected.

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
