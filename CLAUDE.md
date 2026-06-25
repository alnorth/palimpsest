# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Keep this file up to date.** When making structural changes to the codebase — new modules, changed data flow, new domain concepts, altered invariants — update the relevant sections of this file in the same commit.

**When tagging a release**, always bump the `version` field in `package.json` to match the tag before committing.

## Commands

```bash
npm test              # run all tests (vitest)
npm run test:watch    # run tests in watch mode
npm run typecheck     # tsc --noEmit
npm run build         # tsup (dual ESM/CJS output to dist/)
```

To run a single test file:
```bash
npx vitest run src/recurrence.test.ts
```

To run tests matching a name pattern:
```bash
npx vitest run -t "weekly"
```

## Architecture

This is a pure TypeScript library with no runtime framework. The architecture is strict event-sourcing: all state is derived by replaying an append-only log of events; there is no mutable store of current state.

### Data flow

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

**`recurrence.ts`** — Custom DSL: `"daily"`, `"weekly:monday"`, `"monthly:1"` (days 1–28 only), `"yearly:jan-1"`. All dates computed in UTC. `isValidExpression()` is called by commands before storing an expression.

### Domain model

- **Sphere** — top-level grouping (e.g. "Work", "Personal"). Every project, agenda, and project-less task must belong to one.
- **Project** — belongs to exactly one sphere.
- **Agenda** — belongs to exactly one sphere; has only a `title` (no description). Tasks may optionally be linked to one agenda via `agendaId`.
- **Task** — belongs to a project (inheriting its sphere) OR carries a direct `sphereId`. Never both explicitly — if `projectId` is set, sphere is always derived at query time via `getTaskSphereId`.

### ID types

All IDs are branded strings (`TaskId`, `ProjectId`, `SphereId`, `EventId`) generated with nanoid. The brands are compile-time only — at runtime they are plain strings.

### TypeScript strictness

`tsconfig.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. This means:
- Optional properties must be explicitly `undefined`-checked before access
- Array/Map index access returns `T | undefined`, not `T`
- Patch fields use `null` (CLEAR) rather than `undefined` for intentional removal
