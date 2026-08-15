import type { PalimpsestEvent, ProjectionState, SyncState, Task, TaskId } from '@alnorth/palimpsest'
import { CLEAR, completeTask, deleteTask, getTask, updateTask } from '@alnorth/palimpsest'
import { runQuery } from '@alnorth/palimpsest-query'
import type { ParsedCommand, StatusArg } from '@alnorth/palimpsest-query'
import { attachTodoistUrls } from '@alnorth/palimpsest-todoist'
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

export interface SearchToolInput {
  query: string
  sphere?: string | undefined
  includeArchived?: boolean | undefined
  limit?: number | undefined
}

export interface CompleteTaskToolInput {
  id: string
}

export interface SetDueDateToolInput {
  id: string
  dueDate: string | null
}

export interface DeleteTaskToolInput {
  id: string
}

// "today" is the only natural-language date form this tool resolves, mirroring the `tasks` tool's
// dueOn/dueBefore filters (see @alnorth/palimpsest-query's resolveDateArg) — anything else is passed
// straight through as an ISO date string.
function resolveDueDate(value: string): string {
  if (value !== 'today') return value
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function runToolQuery(store: TaskStore, command: ParsedCommand): Promise<CallToolResult> {
  try {
    await store.sync()
    const state = await store.getState()
    const data = attachTodoistUrls(runQuery(state, command))
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

export function handleSearch(store: TaskStore, input: SearchToolInput): Promise<CallToolResult> {
  return runToolQuery(store, {
    kind: 'search',
    query: input.query,
    ...(input.sphere !== undefined && { sphere: input.sphere }),
    ...(input.includeArchived === true && { includeArchived: true }),
    ...(input.limit !== undefined && { limit: input.limit }),
  })
}

// Shared scaffolding for every write tool: sync → look up the task → append the event(s) the
// caller's command produces → flush immediately (rather than leaving it for the pending-queue's
// debounced sync) → re-read state so the response reflects what the remote store actually
// confirmed (e.g. a recurring task's server-normalized next due date). TodoistStore.sync()
// swallows network failures internally (sets syncState.health to 'error' instead of rejecting),
// so a failed flush would otherwise look identical to a confirmed one here — check syncState
// afterwards rather than assuming the flush succeeded just because it didn't throw. The write
// itself already happened (appendEvents succeeded), so this is reported as an unsynced success,
// not an error.
async function runToolMutation(
  store: TaskStore,
  taskId: string,
  buildEvents: (task: Task) => PalimpsestEvent[],
): Promise<CallToolResult> {
  try {
    await store.sync()
    const state = await store.getState()
    const task = getTask(state, taskId as TaskId)
    if (task === undefined) throw new Error(`Task not found: ${taskId}`)
    await store.appendEvents(buildEvents(task))
    await store.sync()
    const finalState = await store.getState()
    const data = attachTodoistUrls(runQuery(finalState, { kind: 'task', id: taskId }))
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

export function handleCompleteTask(store: TaskStore, input: CompleteTaskToolInput): Promise<CallToolResult> {
  return runToolMutation(store, input.id, completeTask)
}

export function handleSetDueDate(store: TaskStore, input: SetDueDateToolInput): Promise<CallToolResult> {
  return runToolMutation(store, input.id, task =>
    updateTask(task, { dueDate: input.dueDate === null ? CLEAR : resolveDueDate(input.dueDate) }))
}

export function handleDeleteTask(store: TaskStore, input: DeleteTaskToolInput): Promise<CallToolResult> {
  return runToolMutation(store, input.id, deleteTask)
}
