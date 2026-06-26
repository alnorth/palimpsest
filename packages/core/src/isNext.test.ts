import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createProject, createTask, updateTask } from './commands.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function setup() {
  const projEvts = createProject({ sphereId, name: 'Project A' })
  const s1 = project(projEvts, baseState)
  const projectId = (projEvts[0] as any).projectId as ProjectId
  return { projEvts, s1, sphereId, projectId }
}

describe('isNext on createTask', () => {
  it('can be set to true for a project task', () => {
    const { projEvts, projectId } = setup()
    const taskEvts = createTask({ title: 'T', projectId, isNext: true })
    const s2 = project([...projEvts, ...taskEvts], baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    expect(s2.tasks.get(taskId)?.isNext).toBe(true)
  })

  it('throws when isNext is true on a project-less task', () => {
    expect(() =>
      createTask({ title: 'T', sphereId, isNext: true })
    ).toThrow('isNext can only be set on tasks that belong to a project')
  })

  it('is undefined by default', () => {
    const { projEvts, projectId } = setup()
    const taskEvts = createTask({ title: 'T', projectId })
    const s2 = project([...projEvts, ...taskEvts], baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    expect(s2.tasks.get(taskId)?.isNext).toBeUndefined()
  })
})

describe('isNext on updateTask', () => {
  it('can be set to true on a project task', () => {
    const { projEvts, projectId } = setup()
    const taskEvts = createTask({ title: 'T', projectId })
    const s2 = project([...projEvts, ...taskEvts], baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s2.tasks.get(taskId)!

    const updateEvts = updateTask(task, { isNext: true })
    const s3 = project([...projEvts, ...taskEvts, ...updateEvts], baseState)
    expect(s3.tasks.get(taskId)?.isNext).toBe(true)
  })

  it('can be cleared by setting to false', () => {
    const { projEvts, projectId } = setup()
    const taskEvts = createTask({ title: 'T', projectId, isNext: true })
    const s2 = project([...projEvts, ...taskEvts], baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s2.tasks.get(taskId)!

    const updateEvts = updateTask(task, { isNext: false })
    const s3 = project([...projEvts, ...taskEvts, ...updateEvts], baseState)
    expect(s3.tasks.get(taskId)?.isNext).toBeUndefined()
  })

  it('throws when setting isNext true on a project-less task', () => {
    const taskEvts = createTask({ title: 'T', sphereId })
    const s2 = project([...taskEvts], baseState)
    const taskId = (taskEvts[0] as any).taskId as TaskId
    const task = s2.tasks.get(taskId)!

    expect(() =>
      updateTask(task, { isNext: true })
    ).toThrow('isNext can only be set on tasks that belong to a project')
  })
})
