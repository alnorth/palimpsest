import type { TaskId, ProjectId, SphereId, AgendaId, ContextId, EventId } from './ids'
import type { WaitingFor } from './types'

export const CLEAR = null

// Resolves the effective value of an optional, CLEAR-able patched field: the patch's own value if
// present (undefined meaning "unchanged"), else the entity's current value; CLEAR resolves to
// undefined either way. Shared by commands.ts (entity+patch only) and validation.ts (which
// re-derives the same effective value with full ProjectionState access) so the CLEAR-sentinel
// resolution logic lives in exactly one place.
export function resolvePatched<T>(current: T | undefined, patched: T | typeof CLEAR | undefined): T | undefined {
  if (patched === undefined) return current
  return patched === CLEAR ? undefined : patched
}

interface EventBase {
  id: EventId
  occurredAt: string
}

// ── Project events ────────────────────────────────────────────────────────────

export interface ProjectCreatedEvent extends EventBase {
  type: 'project.created'
  projectId: ProjectId
  sphereId: SphereId
  name: string
  description?: string
  agendaId?: AgendaId
  isSelfOnly?: true
}

export type ProjectPatch = {
  name?: string
  description?: string | typeof CLEAR
  sphereId?: SphereId
  agendaId?: AgendaId | typeof CLEAR
  isSelfOnly?: boolean
}

export interface ProjectUpdatedEvent extends EventBase {
  type: 'project.updated'
  projectId: ProjectId
  patch: ProjectPatch
}

export interface ProjectArchivedEvent extends EventBase {
  type: 'project.archived'
  projectId: ProjectId
}

export interface ProjectUnarchivedEvent extends EventBase {
  type: 'project.unarchived'
  projectId: ProjectId
}

// ── Task events ───────────────────────────────────────────────────────────────

export interface TaskCreatedEvent extends EventBase {
  type: 'task.created'
  taskId: TaskId
  title: string
  description: string
  projectId?: ProjectId
  sphereId?: SphereId
  agendaId?: AgendaId
  contextId?: ContextId
  isNext?: true
  isStarred?: true
  waitingFor?: WaitingFor
  dueDate?: string
  dueDateExpression?: string
}

export type TaskPatch = {
  title?: string
  description?: string
  projectId?: ProjectId | typeof CLEAR
  sphereId?: SphereId | typeof CLEAR
  agendaId?: AgendaId | typeof CLEAR
  contextId?: ContextId | typeof CLEAR
  isNext?: boolean
  isStarred?: boolean
  waitingFor?: WaitingFor | typeof CLEAR
  dueDate?: string | typeof CLEAR
  dueDateExpression?: string | typeof CLEAR
}

export interface TaskUpdatedEvent extends EventBase {
  type: 'task.updated'
  taskId: TaskId
  patch: TaskPatch
}

export interface TaskCompletedEvent extends EventBase {
  type: 'task.completed'
  taskId: TaskId
}

export interface TaskRecurredEvent extends EventBase {
  type: 'task.recurred'
  taskId: TaskId
  previousDueDate?: string
  newDueDate: string
}

export interface TaskUncompletedEvent extends EventBase {
  type: 'task.uncompleted'
  taskId: TaskId
}

export interface TaskDeletedEvent extends EventBase {
  type: 'task.deleted'
  taskId: TaskId
}

// ── Union ─────────────────────────────────────────────────────────────────────

export type PalimpsestEvent =
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectArchivedEvent
  | ProjectUnarchivedEvent
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TaskUncompletedEvent
  | TaskRecurredEvent
  | TaskDeletedEvent
