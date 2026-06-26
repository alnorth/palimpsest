import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createProject, createTask, updateTask } from './commands.js'
import { validateBatch } from './validation.js'
import type { PalimpsestEvent } from './events.js'
import type { SphereId, ProjectId, TaskId, EventId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

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
})
