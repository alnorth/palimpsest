import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection'
import { buildStateFromConfig } from './config'
import { createProject, createTask, updateTask, updateProject } from './commands'
import { validateBatch } from './validation'
import type { PalimpsestEvent } from './events'
import type { SphereId, ProjectId, TaskId, EventId, AgendaId } from './ids'

const sphereId = 'sph1' as SphereId
const agendaId = 'ag1' as AgendaId
const otherSphereId = 'sph2' as SphereId
const otherAgendaId = 'ag2' as AgendaId
const baseState = {
  ...createEmptyState(),
  ...buildStateFromConfig([
    { id: sphereId, name: 'Work', agendas: [{ id: agendaId, title: 'Weekly Review' }], contexts: [] },
    { id: otherSphereId, name: 'Personal', agendas: [{ id: otherAgendaId, title: 'Family' }], contexts: [] },
  ]),
}

describe('validateBatch', () => {
  it('accepts an empty batch', () => {
    expect(() => validateBatch(baseState, [])).not.toThrow()
  })

  it('accepts a valid project.created event', () => {
    const evts = createProject({ name: 'Proj', sphereId })
    expect(() => validateBatch(baseState, evts)).not.toThrow()
  })

  it('accepts create-project then assign-task in the same batch', () => {
    const taskEvts = createTask({ title: 'My task', sphereId })
    const s1 = project(taskEvts, baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(taskId)!

    const projectEvts = createProject({ name: 'New project', sphereId })
    const projectId = (projectEvts[0] as any).projectId as ProjectId

    // updateTask with the projectId — valid because validateBatch threads state
    const assignEvts = updateTask(task, { projectId, sphereId: null })

    expect(() => validateBatch(s1, [...projectEvts, ...assignEvts])).not.toThrow()
  })

  it('throws when a task.updated event references a project not in state or earlier in the batch', () => {
    const taskEvts = createTask({ title: 'My task', sphereId })
    const s1 = project(taskEvts, baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s1.tasks.get(taskId)!

    const assignEvts = updateTask(task, { projectId: 'ghost-project' as ProjectId, sphereId: null })
    expect(() => validateBatch(s1, assignEvts)).toThrow('Project not found')
  })

  it('throws when a project.created event references a non-existent sphere', () => {
    const badEvent: PalimpsestEvent = {
      id: 'evt-x' as EventId,
      type: 'project.created',
      projectId: 'proj-x' as ProjectId,
      sphereId: 'ghost-sphere' as SphereId,
      occurredAt: new Date().toISOString(),
      name: 'Bad project',
    }
    expect(() => validateBatch(baseState, [badEvent])).toThrow('Sphere not found')
  })

  it('throws when a task.updated event references a non-existent task', () => {
    const badEvent: PalimpsestEvent = {
      id: 'evt-x' as EventId,
      type: 'task.updated',
      taskId: 'ghost-task' as TaskId,
      occurredAt: new Date().toISOString(),
      patch: { title: 'x' },
    }
    expect(() => validateBatch(baseState, [badEvent])).toThrow('Task not found')
  })

  it('accepts a project.created event with a valid agendaId', () => {
    const evts = createProject({ name: 'Shared project', sphereId, agendaId })
    expect(() => validateBatch(baseState, evts)).not.toThrow()
  })

  it('throws when a project.created event references a non-existent agenda', () => {
    const evts = createProject({ name: 'Shared project', sphereId, agendaId: 'ghost-agenda' as AgendaId })
    expect(() => validateBatch(baseState, evts)).toThrow('Agenda not found')
  })

  it('throws when a project.updated patch references a non-existent agenda', () => {
    const projEvts = createProject({ name: 'Proj', sphereId })
    const s1 = project(projEvts, baseState)
    const projectId = (projEvts[0] as any).projectId as ProjectId
    const proj = s1.projects.get(projectId)!
    const updateEvts = updateProject(proj, { agendaId: 'ghost-agenda' as AgendaId })
    expect(() => validateBatch(s1, updateEvts)).toThrow('Agenda not found')
  })

  it('accepts a project.updated patch clearing agendaId', () => {
    const projEvts = createProject({ name: 'Proj', sphereId, agendaId })
    const s1 = project(projEvts, baseState)
    const projectId = (projEvts[0] as any).projectId as ProjectId
    const proj = s1.projects.get(projectId)!
    const clearEvts = updateProject(proj, { agendaId: null })
    expect(() => validateBatch(s1, clearEvts)).not.toThrow()
  })

  it('throws when a project.created event links an agenda from a different sphere', () => {
    const evts = createProject({ name: 'Cross-sphere', sphereId, agendaId: otherAgendaId })
    expect(() => validateBatch(baseState, evts)).toThrow('different sphere')
  })

  it('throws when a project.updated patch links an agenda from a different sphere', () => {
    const projEvts = createProject({ name: 'Proj', sphereId })
    const s1 = project(projEvts, baseState)
    const projectId = (projEvts[0] as any).projectId as ProjectId
    const proj = s1.projects.get(projectId)!
    const updateEvts = updateProject(proj, { agendaId: otherAgendaId })
    expect(() => validateBatch(s1, updateEvts)).toThrow('different sphere')
  })

  it('throws when moving a project to a different sphere invalidates its existing agenda link', () => {
    const projEvts = createProject({ name: 'Proj', sphereId, agendaId })
    const s1 = project(projEvts, baseState)
    const projectId = (projEvts[0] as any).projectId as ProjectId
    const proj = s1.projects.get(projectId)!
    // Only sphereId is patched — the existing agendaId is unchanged but now cross-sphere.
    const moveEvts = updateProject(proj, { sphereId: otherSphereId })
    expect(() => validateBatch(s1, moveEvts)).toThrow('different sphere')
  })

  it('accepts moving a project and its agenda link to the same new sphere in one batch', () => {
    const projEvts = createProject({ name: 'Proj', sphereId, agendaId })
    const s1 = project(projEvts, baseState)
    const projectId = (projEvts[0] as any).projectId as ProjectId
    const proj = s1.projects.get(projectId)!
    const moveEvts = updateProject(proj, { sphereId: otherSphereId, agendaId: otherAgendaId })
    expect(() => validateBatch(s1, moveEvts)).not.toThrow()
  })

  it('accepts an unrelated patch on a project that already carries a legacy cross-sphere agenda link', () => {
    // Simulates data that predates this validation (e.g. tolerantly folded in by the read path from
    // pre-existing Todoist data) — constructed directly via project(), bypassing validateBatch,
    // since createProject+validateBatch would reject writing this link today.
    const badEvent: PalimpsestEvent = {
      id: 'evt-x' as EventId, type: 'project.created', occurredAt: new Date().toISOString(),
      projectId: 'proj-x' as ProjectId, sphereId, agendaId: otherAgendaId, name: 'Legacy project',
    }
    const s1 = project([badEvent], baseState)
    const proj = s1.projects.get('proj-x' as ProjectId)!
    const renameEvts = updateProject(proj, { name: 'Renamed' })
    expect(() => validateBatch(s1, renameEvts)).not.toThrow()
  })
})
