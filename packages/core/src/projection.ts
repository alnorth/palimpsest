import type { Task, Project, Sphere, Agenda, Context } from './types.js'
import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from './ids.js'
import type { PalimpsestEvent } from './events.js'
import { CLEAR } from './events.js'

export interface ProjectionState {
  spheres:   Map<SphereId, Sphere>
  projects:  Map<ProjectId, Project>
  contexts:  Map<ContextId, Context>
  agendas:   Map<AgendaId, Agenda>
  tasks:     Map<TaskId, Task>
}

export function createEmptyState(): ProjectionState {
  return { spheres: new Map(), projects: new Map(), contexts: new Map(), agendas: new Map(), tasks: new Map() }
}

export function applyEvent(state: ProjectionState, event: PalimpsestEvent): ProjectionState {
  switch (event.type) {

    case 'project.created': {
      const project: Project = {
        id: event.projectId,
        sphereId: event.sphereId,
        name: event.name,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        ...(event.description !== undefined && { description: event.description }),
      }
      state.projects.set(project.id, project)
      return state
    }

    case 'project.updated': {
      const project = state.projects.get(event.projectId)
      if (!project) return state
      const { patch } = event
      if (patch.name !== undefined) project.name = patch.name
      if (patch.sphereId !== undefined) project.sphereId = patch.sphereId
      if (patch.description !== undefined) {
        if (patch.description === CLEAR) delete project.description
        else project.description = patch.description
      }
      project.updatedAt = event.occurredAt
      return state
    }

    case 'project.archived': {
      const project = state.projects.get(event.projectId)
      if (!project) return state
      project.isArchived = true
      project.archivedAt = event.occurredAt
      project.updatedAt  = event.occurredAt
      return state
    }

    case 'project.unarchived': {
      const project = state.projects.get(event.projectId)
      if (!project) return state
      delete project.isArchived
      delete project.archivedAt
      project.updatedAt = event.occurredAt
      return state
    }

    case 'task.created': {
      const task: Task = {
        id: event.taskId,
        title: event.title,
        description: event.description,
        status: 'open',
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        ...(event.projectId         !== undefined && { projectId:         event.projectId }),
        ...(event.sphereId          !== undefined && { sphereId:          event.sphereId }),
        ...(event.agendaId          !== undefined && { agendaId:          event.agendaId }),
        ...(event.contextId         !== undefined && { contextId:         event.contextId }),
        ...(event.isNext            !== undefined && { isNext:            event.isNext }),
        ...(event.isStarred         !== undefined && { isStarred:         event.isStarred }),
        ...(event.waitingFor        !== undefined && { waitingFor:        event.waitingFor }),
        ...(event.dueDate           !== undefined && { dueDate:           event.dueDate }),
        ...(event.dueDateExpression !== undefined && { dueDateExpression: event.dueDateExpression }),
      }
      state.tasks.set(task.id, task)
      return state
    }

    case 'task.updated': {
      const task = state.tasks.get(event.taskId)
      if (!task) return state
      const { patch } = event
      if (patch.title       !== undefined) task.title       = patch.title
      if (patch.description !== undefined) task.description = patch.description
      if (patch.projectId !== undefined) {
        if (patch.projectId === CLEAR) delete task.projectId
        else task.projectId = patch.projectId
      }
      if (patch.sphereId !== undefined) {
        if (patch.sphereId === CLEAR) delete task.sphereId
        else task.sphereId = patch.sphereId
      }
      if (patch.agendaId !== undefined) {
        if (patch.agendaId === CLEAR) delete task.agendaId
        else task.agendaId = patch.agendaId
      }
      if (patch.contextId !== undefined) {
        if (patch.contextId === CLEAR) delete task.contextId
        else task.contextId = patch.contextId
      }
      if (patch.isNext !== undefined) {
        if (patch.isNext === false) delete task.isNext
        else task.isNext = true
      }
      if (patch.isStarred !== undefined) {
        if (patch.isStarred === false) delete task.isStarred
        else task.isStarred = true
      }
      if (patch.waitingFor !== undefined) {
        if (patch.waitingFor === CLEAR) delete task.waitingFor
        else task.waitingFor = patch.waitingFor
      }
      if (patch.dueDate !== undefined) {
        if (patch.dueDate === CLEAR) delete task.dueDate
        else task.dueDate = patch.dueDate
      }
      if (patch.dueDateExpression !== undefined) {
        if (patch.dueDateExpression === CLEAR) delete task.dueDateExpression
        else task.dueDateExpression = patch.dueDateExpression
      }
      task.updatedAt = event.occurredAt
      return state
    }

    case 'task.completed': {
      const task = state.tasks.get(event.taskId)
      // no-op if task doesn't exist or is a recurring task
      if (!task || task.dueDateExpression !== undefined) return state
      task.status      = 'completed'
      task.completedAt = event.occurredAt
      task.updatedAt   = event.occurredAt
      return state
    }

    case 'task.uncompleted': {
      const task = state.tasks.get(event.taskId)
      if (!task || task.status !== 'completed') return state
      task.status    = 'open'
      task.updatedAt = event.occurredAt
      delete task.completedAt
      return state
    }

    case 'task.recurred': {
      const task = state.tasks.get(event.taskId)
      // no-op if task doesn't exist or is not a recurring task
      if (!task || task.dueDateExpression === undefined) return state
      task.dueDate        = event.newDueDate
      task.lastRecurredAt = event.occurredAt
      task.updatedAt      = event.occurredAt
      return state
    }

    case 'task.deleted': {
      const task = state.tasks.get(event.taskId)
      if (!task) return state
      task.status    = 'deleted'
      task.updatedAt = event.occurredAt
      return state
    }

    default:
      // Silently skip removed or unrecognised event types (e.g. sphere/agenda/context events
      // from files written before config-based management was introduced)
      return state
  }
}

export function project(events: readonly PalimpsestEvent[], initialState?: ProjectionState): ProjectionState {
  if (events.length === 0) return initialState ?? createEmptyState()
  const startState = initialState !== undefined
    ? {
        spheres:  new Map(initialState.spheres),
        agendas:  new Map(initialState.agendas),
        contexts: new Map(initialState.contexts),
        projects: new Map(initialState.projects),
        tasks:    new Map(initialState.tasks),
      }
    : createEmptyState()
  return events.reduce(
    (state, event) => applyEvent(state, event),
    startState,
  )
}
