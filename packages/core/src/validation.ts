import type { ProjectionState } from './projection'
import type { PalimpsestEvent } from './events'
import { CLEAR } from './events'
import { applyEvent, cloneState } from './projection'

function validateEvent(state: ProjectionState, event: PalimpsestEvent): void {
  switch (event.type) {
    case 'project.created': {
      if (!state.spheres.has(event.sphereId)) throw new Error(`Sphere not found: ${event.sphereId}`)
      if (event.agendaId !== undefined) {
        const agenda = state.agendas.get(event.agendaId)
        if (agenda === undefined) throw new Error(`Agenda not found: ${event.agendaId}`)
        if (agenda.sphereId !== event.sphereId) {
          throw new Error(`Agenda ${event.agendaId} belongs to a different sphere than project ${event.projectId}`)
        }
      }
      break
    }
    case 'project.updated': {
      const project = state.projects.get(event.projectId)
      if (!project) throw new Error(`Project not found: ${event.projectId}`)
      if (event.patch.sphereId !== undefined && !state.spheres.has(event.patch.sphereId)) {
        throw new Error(`Sphere not found: ${event.patch.sphereId}`)
      }
      if (event.patch.agendaId != null && !state.agendas.has(event.patch.agendaId)) {
        throw new Error(`Agenda not found: ${event.patch.agendaId}`)
      }
      const effectiveSphereId = event.patch.sphereId ?? project.sphereId
      const effectiveAgendaId = event.patch.agendaId !== undefined
        ? (event.patch.agendaId === CLEAR ? undefined : event.patch.agendaId)
        : project.agendaId
      if (effectiveAgendaId !== undefined) {
        const agenda = state.agendas.get(effectiveAgendaId)
        if (agenda !== undefined && agenda.sphereId !== effectiveSphereId) {
          throw new Error(`Agenda ${effectiveAgendaId} belongs to a different sphere than project ${event.projectId}`)
        }
      }
      break
    }
    case 'project.archived':
    case 'project.unarchived':
      if (!state.projects.has(event.projectId)) throw new Error(`Project not found: ${event.projectId}`)
      break
    case 'task.created':
      if (event.projectId !== undefined && !state.projects.has(event.projectId)) {
        throw new Error(`Project not found: ${event.projectId}`)
      }
      if (event.sphereId !== undefined && !state.spheres.has(event.sphereId)) {
        throw new Error(`Sphere not found: ${event.sphereId}`)
      }
      if (event.agendaId !== undefined && !state.agendas.has(event.agendaId)) {
        throw new Error(`Agenda not found: ${event.agendaId}`)
      }
      if (event.contextId !== undefined && !state.contexts.has(event.contextId)) {
        throw new Error(`Context not found: ${event.contextId}`)
      }
      if (event.waitingFor?.kind === 'agenda' && !state.agendas.has(event.waitingFor.agendaId)) {
        throw new Error(`Agenda not found: ${event.waitingFor.agendaId}`)
      }
      if (event.waitingFor?.kind === 'project' && !state.projects.has(event.waitingFor.projectId)) {
        throw new Error(`Project not found: ${event.waitingFor.projectId}`)
      }
      break
    case 'task.updated':
      if (!state.tasks.has(event.taskId)) throw new Error(`Task not found: ${event.taskId}`)
      if (event.patch.projectId != null && !state.projects.has(event.patch.projectId)) {
        throw new Error(`Project not found: ${event.patch.projectId}`)
      }
      if (event.patch.sphereId != null && !state.spheres.has(event.patch.sphereId)) {
        throw new Error(`Sphere not found: ${event.patch.sphereId}`)
      }
      if (event.patch.agendaId != null && !state.agendas.has(event.patch.agendaId)) {
        throw new Error(`Agenda not found: ${event.patch.agendaId}`)
      }
      if (event.patch.contextId != null && !state.contexts.has(event.patch.contextId)) {
        throw new Error(`Context not found: ${event.patch.contextId}`)
      }
      if (event.patch.waitingFor != null && event.patch.waitingFor.kind === 'agenda' && !state.agendas.has(event.patch.waitingFor.agendaId)) {
        throw new Error(`Agenda not found: ${event.patch.waitingFor.agendaId}`)
      }
      if (event.patch.waitingFor != null && event.patch.waitingFor.kind === 'project' && !state.projects.has(event.patch.waitingFor.projectId)) {
        throw new Error(`Project not found: ${event.patch.waitingFor.projectId}`)
      }
      break
    case 'task.completed':
    case 'task.uncompleted':
    case 'task.recurred':
    case 'task.deleted':
      if (!state.tasks.has(event.taskId)) throw new Error(`Task not found: ${event.taskId}`)
      break
  }
}

export function validateBatch(initialState: ProjectionState, events: readonly PalimpsestEvent[]): void {
  const state = cloneState(initialState)
  for (const event of events) {
    validateEvent(state, event)
    applyEvent(state, event)
  }
}
