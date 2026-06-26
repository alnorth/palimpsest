import type { ProjectionState } from './projection.js'
import type { PalimpsestEvent, TaskPatch, ProjectPatch } from './events.js'
import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from './ids.js'
import { newTaskId, newProjectId, newEventId } from './ids.js'
import { nextDueDate, isValidExpression } from './dateParser.js'

function now(): string {
  return new Date().toISOString()
}

// ── Project commands ──────────────────────────────────────────────────────────

export interface CreateProjectInput {
  sphereId: SphereId
  name: string
  description?: string
}

export function createProject(
  state: ProjectionState,
  input: CreateProjectInput,
): PalimpsestEvent[] {
  if (!state.spheres.has(input.sphereId)) throw new Error(`Sphere not found: ${input.sphereId}`)
  return [{
    id: newEventId(),
    type: 'project.created',
    projectId: newProjectId(),
    occurredAt: now(),
    sphereId: input.sphereId,
    name: input.name,
    ...(input.description !== undefined && { description: input.description }),
  }]
}

export function updateProject(
  state: ProjectionState,
  projectId: ProjectId,
  patch: ProjectPatch,
): PalimpsestEvent[] {
  if (!state.projects.has(projectId)) throw new Error(`Project not found: ${projectId}`)
  if (patch.sphereId !== undefined && !state.spheres.has(patch.sphereId)) {
    throw new Error(`Sphere not found: ${patch.sphereId}`)
  }
  return [{
    id: newEventId(),
    type: 'project.updated',
    projectId,
    occurredAt: now(),
    patch,
  }]
}

export function deleteProject(
  state: ProjectionState,
  projectId: ProjectId,
): PalimpsestEvent[] {
  if (!state.projects.has(projectId)) throw new Error(`Project not found: ${projectId}`)
  return [{
    id: newEventId(),
    type: 'project.deleted',
    projectId,
    occurredAt: now(),
  }]
}

export function archiveProject(
  state: ProjectionState,
  projectId: ProjectId,
): PalimpsestEvent[] {
  const project = state.projects.get(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  if (project.isArchived) throw new Error('Project is already archived')
  return [{
    id: newEventId(),
    type: 'project.archived',
    projectId,
    occurredAt: now(),
  }]
}

export function unarchiveProject(
  state: ProjectionState,
  projectId: ProjectId,
): PalimpsestEvent[] {
  const project = state.projects.get(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  if (!project.isArchived) throw new Error('Project is not archived')
  return [{
    id: newEventId(),
    type: 'project.unarchived',
    projectId,
    occurredAt: now(),
  }]
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

export function createTask(
  state: ProjectionState,
  input: CreateTaskInput,
): PalimpsestEvent[] {
  if (input.projectId === undefined && input.sphereId === undefined) {
    throw new Error('Task must belong to a project or have a direct sphereId')
  }
  if (input.projectId !== undefined && !state.projects.has(input.projectId)) {
    throw new Error(`Project not found: ${input.projectId}`)
  }
  if (input.sphereId !== undefined && !state.spheres.has(input.sphereId)) {
    throw new Error(`Sphere not found: ${input.sphereId}`)
  }
  if (input.agendaId !== undefined && !state.agendas.has(input.agendaId)) {
    throw new Error(`Agenda not found: ${input.agendaId}`)
  }
  if (input.contextId !== undefined && !state.contexts.has(input.contextId)) {
    throw new Error(`Context not found: ${input.contextId}`)
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
  return [{
    id: newEventId(),
    type: 'task.created',
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
  }]
}

export interface UpdateTaskInput {
  taskId: TaskId
  patch: TaskPatch
}

export function updateTask(
  state: ProjectionState,
  input: UpdateTaskInput,
): PalimpsestEvent[] {
  const task = state.tasks.get(input.taskId)
  if (!task) throw new Error(`Task not found: ${input.taskId}`)
  if (task.status !== 'open') throw new Error(`Cannot update a ${task.status} task`)

  const { patch } = input
  if (patch.projectId !== undefined && patch.projectId !== null && !state.projects.has(patch.projectId)) {
    throw new Error(`Project not found: ${patch.projectId}`)
  }
  if (patch.sphereId !== undefined && patch.sphereId !== null && !state.spheres.has(patch.sphereId)) {
    throw new Error(`Sphere not found: ${patch.sphereId}`)
  }
  if (patch.agendaId !== undefined && patch.agendaId !== null && !state.agendas.has(patch.agendaId)) {
    throw new Error(`Agenda not found: ${patch.agendaId}`)
  }
  if (patch.contextId !== undefined && patch.contextId !== null && !state.contexts.has(patch.contextId)) {
    throw new Error(`Context not found: ${patch.contextId}`)
  }
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

  return [{
    id: newEventId(),
    type: 'task.updated',
    taskId: input.taskId,
    occurredAt: now(),
    patch: emittedPatch,
  }]
}

export function completeTask(
  state: ProjectionState,
  taskId: TaskId,
): PalimpsestEvent[] {
  const task = state.tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)

  const occurredAt = now()

  if (task.dueDateExpression !== undefined) {
    const newDueDate = nextDueDate(task.dueDateExpression, occurredAt.slice(0, 10))
    if (newDueDate === null) {
      throw new Error(`No future occurrence for expression: "${task.dueDateExpression}"`)
    }
    return [{
      id: newEventId(),
      type: 'task.recurred',
      taskId,
      occurredAt,
      newDueDate,
      ...(task.dueDate !== undefined && { previousDueDate: task.dueDate }),
    }]
  }

  return [{
    id: newEventId(),
    type: 'task.completed',
    taskId,
    occurredAt,
  }]
}

export function uncompleteTask(
  state: ProjectionState,
  taskId: TaskId,
): PalimpsestEvent[] {
  const task = state.tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  if (task.status !== 'completed') throw new Error(`Task is not completed`)
  return [{
    id: newEventId(),
    type: 'task.uncompleted',
    taskId,
    occurredAt: now(),
  }]
}

export function deleteTask(
  state: ProjectionState,
  taskId: TaskId,
): PalimpsestEvent[] {
  const task = state.tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  if (task.status === 'deleted') throw new Error('Task is already deleted')
  return [{
    id: newEventId(),
    type: 'task.deleted',
    taskId,
    occurredAt: now(),
  }]
}

export function postponeTask(
  state: ProjectionState,
  taskId: TaskId,
): PalimpsestEvent[] {
  const task = state.tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)
  if (task.dueDateExpression === undefined) throw new Error('Task has no recurrence expression')
  const today = now().slice(0, 10)
  const newDueDate = nextDueDate(task.dueDateExpression, today)
  if (newDueDate === null) throw new Error(`No future occurrence for expression: "${task.dueDateExpression}"`)
  return [{
    id: newEventId(),
    type: 'task.updated',
    taskId,
    occurredAt: now(),
    patch: { dueDate: newDueDate },
  }]
}

export function finishRecurringTask(
  state: ProjectionState,
  taskId: TaskId,
): PalimpsestEvent[] {
  const task = state.tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  if (task.status !== 'open') throw new Error(`Task is already ${task.status}`)
  if (task.dueDateExpression === undefined) throw new Error('Task has no recurrence expression; use completeTask instead')
  const occurredAt = now()
  return [
    {
      id: newEventId(),
      type: 'task.updated',
      taskId,
      occurredAt,
      patch: { dueDateExpression: null },
    },
    {
      id: newEventId(),
      type: 'task.completed',
      taskId,
      occurredAt,
    },
  ]
}
