import type { ProjectionState } from 'palimpsest'
import { runQuery } from 'palimpsest-cli/query'
import type { ParsedCommand, StatusArg } from 'palimpsest-cli/query'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export interface TaskStore {
  sync(): Promise<void>
  getState(): Promise<ProjectionState>
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
