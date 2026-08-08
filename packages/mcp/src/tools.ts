import type { PalimpsestEvent, ProjectionState, SyncState, TaskId } from '@alnorth/palimpsest'
import { completeTask, getTask } from '@alnorth/palimpsest'
import { runQuery } from '@alnorth/palimpsest-query'
import type { ParsedCommand, StatusArg } from '@alnorth/palimpsest-query'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export interface TaskStore {
  sync(): Promise<void>
  getState(): Promise<ProjectionState>
  appendEvents(events: PalimpsestEvent[]): Promise<void>
  // Optional: PollingStore-backed stores (e.g. TodoistStore) expose this; handleCompleteTask uses
  // it to detect a confirmation sync that failed silently (see below) rather than throwing.
  readonly syncState?: SyncState
}

export interface TasksToolInput {
  sphere?: string | undefined
  project?: string | undefined
  agenda?: string | undefined
  context?: string | undefined
  status?: StatusArg | undefined
  starred?: boolean | undefined
  actionable?: boolean | undefined
  waiting?: boolean | undefined
  notWaiting?: boolean | undefined
  inbox?: boolean | undefined
  dueOn?: string | undefined
  dueBefore?: string | undefined
  hasDueDate?: boolean | undefined
  withoutDueDate?: boolean | undefined
  hasAgenda?: boolean | undefined
  withoutAgenda?: boolean | undefined
  hasContext?: boolean | undefined
  withoutContext?: boolean | undefined
  includeArchived?: boolean | undefined
  limit?: number | undefined
}

export interface TaskToolInput {
  id: string
}

export interface ProjectsToolInput {
  sphere?: string | undefined
  archived?: boolean | undefined
  all?: boolean | undefined
}

export interface SphereScopedToolInput {
  sphere?: string | undefined
}

export interface DashboardToolInput {
  sphere: string
  limit?: number | undefined
}

export type ProcessingToolInput = Record<string, never>

export interface PickListToolInput {
  sphere: string
}

export interface CompleteTaskToolInput {
  id: string
}

async function runToolQuery(store: TaskStore, command: ParsedCommand): Promise<CallToolResult> {
  try {
    await store.sync()
    const state = await store.getState()
    const data = runQuery(state, command)
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...data }, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

export function handleTasks(store: TaskStore, input: TasksToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'tasks',
    ...(input.sphere !== undefined && { sphere: input.sphere }),
    ...(input.project !== undefined && { project: input.project }),
    ...(input.agenda !== undefined && { agenda: input.agenda }),
    ...(input.context !== undefined && { context: input.context }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.starred === true && { starred: true }),
    ...(input.actionable === true && { actionable: true }),
    ...(input.waiting === true && { waiting: true }),
    ...(input.notWaiting === true && { notWaiting: true }),
    ...(input.inbox === true && { noProject: true }),
    ...(input.dueOn !== undefined && { dueOn: input.dueOn }),
    ...(input.dueBefore !== undefined && { dueBefore: input.dueBefore }),
    ...(input.hasDueDate === true && { hasDueDate: true }),
    ...(input.withoutDueDate === true && { withoutDueDate: true }),
    ...(input.hasAgenda === true && { hasAgenda: true }),
    ...(input.withoutAgenda === true && { withoutAgenda: true }),
    ...(input.hasContext === true && { hasContext: true }),
    ...(input.withoutContext === true && { withoutContext: true }),
    ...(input.includeArchived === true && { includeArchived: true }),
    ...(input.limit !== undefined && { limit: input.limit }),
  })
}

export function handleTask(store: TaskStore, input: TaskToolInput): Promise<CallToolResult> {
  return runToolQuery(store, { kind: 'task', id: input.id })
}

export function handleProjects(store: TaskStore, input: ProjectsToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'projects',
    ...(input.sphere !== undefined && { sphere: input.sphere }),
    ...(input.archived === true && { archived: true }),
    ...(input.all === true && { all: true }),
  })
}

export function handleSpheres(store: TaskStore, _input: Record<string, never>): Promise<CallToolResult> {
  return runToolQuery(store, { kind: 'spheres' })
}

export function handleAgendas(store: TaskStore, input: SphereScopedToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'agendas',
    ...(input.sphere !== undefined && { sphere: input.sphere }),
  })
}

export function handleContexts(store: TaskStore, input: SphereScopedToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'contexts',
    ...(input.sphere !== undefined && { sphere: input.sphere }),
  })
}

export function handleDashboard(store: TaskStore, input: DashboardToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'dashboard',
    sphere: input.sphere,
    ...(input.limit !== undefined && { limit: input.limit }),
  })
}

export function handleProcessing(store: TaskStore, _input: ProcessingToolInput): Promise<CallToolResult> {
  return runToolQuery(store, { kind: 'processing' })
}

export function handleWaiting(store: TaskStore, input: SphereScopedToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'waiting',
    ...(input.sphere !== undefined && { sphere: input.sphere }),
  })
}

export function handlePickList(store: TaskStore, input: PickListToolInput): Promise<CallToolResult> {
  return runToolQuery(store, { kind: 'pick_list', sphere: input.sphere })
}

export async function handleCompleteTask(store: TaskStore, input: CompleteTaskToolInput): Promise<CallToolResult> {
  try {
    await store.sync()
    const state = await store.getState()
    const task = getTask(state, input.id as TaskId)
    if (task === undefined) throw new Error(`Task not found: ${input.id}`)
    await store.appendEvents(completeTask(task))
    // Flush the just-appended event through immediately rather than leaving it for the
    // pending-queue's debounced sync, so the response reflects what the remote store actually
    // confirmed (e.g. a recurring task's server-normalized next due date). TodoistStore.sync()
    // swallows network failures internally (sets syncState.health to 'error' instead of
    // rejecting), so a failed flush would otherwise look identical to a confirmed one here —
    // check syncState afterwards rather than assuming the flush succeeded just because it didn't
    // throw. The write itself already happened (appendEvents succeeded), so this is reported as
    // an unsynced success, not an error.
    await store.sync()
    const finalState = await store.getState()
    const data = runQuery(finalState, { kind: 'task', id: input.id })
    const synced = store.syncState?.health !== 'error'
    const response: Record<string, unknown> = { ok: true, synced, ...data }
    if (!synced) {
      response['warning'] =
        `Change applied locally but not yet confirmed by the server (${store.syncState?.lastError ?? 'sync failed'}); it will retry automatically.`
    }
    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}
