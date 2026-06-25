import type { Task, Project, Sphere } from './types.js'
import type { TaskId, ProjectId, SphereId } from './ids.js'
import type { PalimpsestEvent } from './events.js'
import { CLEAR } from './events.js'

export interface ProjectionState {
  spheres:  Map<SphereId, Sphere>
  projects: Map<ProjectId, Project>
  tasks:    Map<TaskId, Task>
}

export function createEmptyState(): ProjectionState {
  return { spheres: new Map(), projects: new Map(), tasks: new Map() }
}

export function applyEvent(state: ProjectionState, event: PalimpsestEvent): ProjectionState {
  switch (event.type) {

    case 'sphere.created': {
      const sphere: Sphere = {
        id: event.sphereId,
        name: event.name,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        ...(event.description !== undefined && { description: event.description }),
      }
      state.spheres.set(sphere.id, sphere)
      return state
    }

    case 'sphere.updated': {
      const sphere = state.spheres.get(event.sphereId)
      if (!sphere) return state
      const { patch } = event
      if (patch.name !== undefined) sphere.name = patch.name
      if (patch.description !== undefined) {
        if (patch.description === CLEAR) delete sphere.description
        else sphere.description = patch.description
      }
      sphere.updatedAt = event.occurredAt
      return state
    }

    case 'sphere.deleted': {
      state.spheres.delete(event.sphereId)
      return state
    }

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

    case 'project.deleted': {
      state.projects.delete(event.projectId)
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
  }
}

export function project(events: readonly PalimpsestEvent[]): ProjectionState {
  return events.reduce(
    (state, event) => applyEvent(state, event),
    createEmptyState(),
  )
}
