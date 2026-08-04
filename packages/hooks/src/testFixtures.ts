import type {
  Task, Project, Sphere, Agenda, Context,
  TaskId, ProjectId, SphereId, AgendaId, ContextId,
  ProjectionState,
} from 'palimpsest'
import { createEmptyState } from 'palimpsest'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}${counter}`
}

export function makeSphere(overrides: Partial<Sphere> = {}): Sphere {
  return {
    id: nextId('sph') as SphereId,
    name: 'Sphere',
    ...overrides,
  }
}

export function makeProject(sphere: Sphere, overrides: Partial<Project> = {}): Project {
  return {
    id: nextId('proj') as ProjectId,
    sphereId: sphere.id,
    name: 'Project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeAgenda(sphere: Sphere, overrides: Partial<Agenda> = {}): Agenda {
  return {
    id: nextId('agn') as AgendaId,
    sphereId: sphere.id,
    title: 'Agenda',
    ...overrides,
  }
}

export function makeContext(sphere: Sphere, overrides: Partial<Context> = {}): Context {
  return {
    id: nextId('ctx') as ContextId,
    sphereId: sphere.id,
    name: 'Context',
    ...overrides,
  }
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId('task') as TaskId,
    title: 'Task',
    description: '',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function buildState(entities: {
  spheres?: Sphere[]
  projects?: Project[]
  agendas?: Agenda[]
  contexts?: Context[]
  tasks?: Task[]
}): ProjectionState {
  const state = createEmptyState()
  for (const sphere of entities.spheres ?? []) state.spheres.set(sphere.id, sphere)
  for (const project of entities.projects ?? []) state.projects.set(project.id, project)
  for (const agenda of entities.agendas ?? []) state.agendas.set(agenda.id, agenda)
  for (const context of entities.contexts ?? []) state.contexts.set(context.id, context)
  for (const task of entities.tasks ?? []) state.tasks.set(task.id, task)
  return state
}
