import type { Task, Project } from './types.js'
import type { PalimpsestEvent, TaskPatch, ProjectPatch } from './events.js'
import type { ProjectId, SphereId, AgendaId, ContextId } from './ids.js'
import { newTaskId, newProjectId, newEventId } from './ids.js'
import { nextDueDate, isValidExpression } from './dateParser.js'

function now(): string {
  return new Date().toISOString()
}

function evt<T extends { type: string }>(fields: T): T & { id: ReturnType<typeof newEventId>; occurredAt: string } {
  return { id: newEventId(), occurredAt: now(), ...fields }
}

// ── Project commands ──────────────────────────────────────────────────────────

export interface CreateProjectInput {
  sphereId: SphereId
  name: string
  description?: string
}

export function createProject(input: CreateProjectInput): PalimpsestEvent[] {
  return [evt({
    type: 'project.created' as const,
    projectId: newProjectId(),
    sphereId: input.sphereId,
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
  })]
}

export function updateProject(project: Project, patch: ProjectPatch): PalimpsestEvent[] {
  return [evt({ type: 'project.updated' as const, projectId: project.id, patch })]
}

export function deleteProject(project: Project): PalimpsestEvent[] {
  return [evt({ type: 'project.deleted' as const, projectId: project.id })]
}

export function archiveProject(project: Project): PalimpsestEvent[] {
  if (project.isArchived) throw new Error('Project is already archived')
  return [evt({ type: 'project.archived' as const, projectId: project.id })]
}

export function unarchiveProject(project: Project): PalimpsestEvent[] {
  if (!project.isArchived) throw new Error('Project is not archived')
  return [evt({ type: 'project.unarchived' as const, projectId: project.id })]
}

// ── Task commands ─────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string
  description?: string
  projectId?: ProjectId
  sphereId?: SphereId
  agendaId?: AgendaId
  contextId?: ContextId
  isNext?: boolean
  isStarred?: boolean
  dueDate?: string
  dueDateExpression?: string
}

export function createTask(input: CreateTaskInput): PalimpsestEvent[] {
  if (input.projectId === undefined && input.sphereId === undefined) {
    throw new Error('Task must belong to a project or have a direct sphereId')
  }
  if (input.isNext === true && input.projectId === undefined) {
    throw new Error('isNext can only be set on tasks that belong to a project')
  }
  if (input.dueDateExpression !== undefined && !isValidExpression(input.dueDateExpression)) {
    throw new Error(`Invalid dueDateExpression: "${input.dueDateExpression}"`)
  }
  const occurredAt = now()
  const today = occurredAt.slice(0, 10)
  const dueDate: string | undefined = input.dueDate
    ?? (input.dueDateExpression !== undefined ? (nextDueDate(input.dueDateExpression, today) ?? undefined) : undefined)
  return [evt({
    type: 'task.created' as const,
    taskId: newTaskId(),
    occurredAt,
    title: input.title,
    description: input.description ?? '',
    ...(input.projectId         !== undefined && { projectId:         input.projectId }),
    ...(input.sphereId          !== undefined && { sphereId:          input.sphereId }),
    ...(input.agendaId          !== undefined && { agendaId:          input.agendaId }),
    ...(input.contextId         !== undefined && { contextId:         input.contextId }),
    ...(input.isNext            === true      && { isNext:            true }),
    ...(input.isStarred         === true      && { isStarred:         true }),
    ...(dueDate                 !== undefined && { dueDate }),
    ...(input.dueDateExpression !== undefined && { dueDateExpression: input.dueDateExpression }),
  })]
}

export function updateTask(task: Task, patch: TaskPatch): PalimpsestEvent[] {
  if (task.status !== 'open') throw new Error(`Cannot update a ${task.status} task`)

  if (patch.isNext === true) {
    const effectiveProjectId = patch.projectId !== null ? (patch.projectId ?? task.projectId) : undefined
    if (effectiveProjectId === undefined) {
      throw new Error('isNext can only be set on tasks that belong to a project')
    }
  }
  if (
    patch.dueDateExpression !== undefined &&
    patch.dueDateExpression !== null &&
    !isValidExpression(patch.dueDateExpression)
  ) {
    throw new Error(`Invalid dueDateExpression: "${patch.dueDateExpression}"`)
  }

  const emittedPatch: TaskPatch = { ...patch }
  if (patch.dueDateExpression !== undefined && patch.dueDateExpression !== null && patch.dueDate === undefined) {
    const today = now().slice(0, 10)
    const computed = nextDueDate(patch.dueDateExpression, today)
    if (computed !== null) emittedPatch.dueDate = computed
  }

  return [evt({ type: 'task.updated' as const, taskId: task.id, patch: emittedPatch })]
}

export function completeTask(task: Task): PalimpsestEvent[] {
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)

  const occurredAt = now()

  if (task.dueDateExpression !== undefined) {
    const newDueDate = nextDueDate(task.dueDateExpression, occurredAt.slice(0, 10))
    if (newDueDate === null) {
      throw new Error(`No future occurrence for expression: "${task.dueDateExpression}"`)
    }
    return [evt({
      type: 'task.recurred' as const,
      taskId: task.id,
      occurredAt,
      newDueDate,
      ...(task.dueDate !== undefined && { previousDueDate: task.dueDate }),
    })]
  }

  return [evt({ type: 'task.completed' as const, taskId: task.id, occurredAt })]
}

export function uncompleteTask(task: Task): PalimpsestEvent[] {
  if (task.status !== 'completed') throw new Error(`Task is not completed`)
  return [evt({ type: 'task.uncompleted' as const, taskId: task.id })]
}

export function deleteTask(task: Task): PalimpsestEvent[] {
  if (task.status === 'deleted') throw new Error('Task is already deleted')
  return [evt({ type: 'task.deleted' as const, taskId: task.id })]
}

export function postponeTask(task: Task): PalimpsestEvent[] {
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)
  if (task.dueDateExpression === undefined) throw new Error('Task has no recurrence expression')
  const today = now().slice(0, 10)
  const newDueDate = nextDueDate(task.dueDateExpression, today)
  if (newDueDate === null) throw new Error(`No future occurrence for expression: "${task.dueDateExpression}"`)
  return [evt({ type: 'task.updated' as const, taskId: task.id, patch: { dueDate: newDueDate } })]
}

export function finishRecurringTask(task: Task): PalimpsestEvent[] {
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)
  if (task.dueDateExpression === undefined) throw new Error('Task has no recurrence expression; use completeTask instead')
  const occurredAt = now()
  return [
    evt({ type: 'task.updated' as const, taskId: task.id, occurredAt, patch: { dueDateExpression: null } }),
    evt({ type: 'task.completed' as const, taskId: task.id, occurredAt }),
  ]
}
