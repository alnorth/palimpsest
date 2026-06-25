import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { createSphere, createProject, createTask, updateTask } from './commands.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'

function setup() {
  const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
  const s1 = project(sphereEvts)
  const sphereId = (sphereEvts[0] as any).sphereId as SphereId

  const projEvts = createProject(s1, { sphereId, name: 'Project A' })
  const s2 = project([...sphereEvts, ...projEvts])
  const projectId = (projEvts[0] as any).projectId as ProjectId

  return { sphereEvts, projEvts, s2, sphereId, projectId }
}

describe('isNext on createTask', () => {
  it('can be set to true for a project task', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const taskEvts = createTask(s2, { title: 'T', projectId, isNext: true })
    const s3 = project([...sphereEvts, ...projEvts, ...taskEvts])
    const taskId = (taskEvts[0] as any).taskId as TaskId
    expect(s3.tasks.get(taskId)?.isNext).toBe(true)
  })

  it('throws when isNext is true on a project-less task', () => {
    const { s2, sphereId } = setup()
    expect(() =>
      createTask(s2, { title: 'T', sphereId, isNext: true })
    ).toThrow('isNext can only be set on tasks that belong to a project')
  })

  it('is undefined by default', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const taskEvts = createTask(s2, { title: 'T', projectId })
    const s3 = project([...sphereEvts, ...projEvts, ...taskEvts])
    const taskId = (taskEvts[0] as any).taskId as TaskId
    expect(s3.tasks.get(taskId)?.isNext).toBeUndefined()
  })
})

describe('isNext on updateTask', () => {
  it('can be set to true on a project task', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const taskEvts = createTask(s2, { title: 'T', projectId })
    const s3 = project([...sphereEvts, ...projEvts, ...taskEvts])
    const taskId = (taskEvts[0] as any).taskId as TaskId

    const updateEvts = updateTask(s3, { taskId, patch: { isNext: true } })
    const s4 = project([...sphereEvts, ...projEvts, ...taskEvts, ...updateEvts])
    expect(s4.tasks.get(taskId)?.isNext).toBe(true)
  })

  it('can be cleared by setting to false', () => {
    const { sphereEvts, projEvts, s2, projectId } = setup()
    const taskEvts = createTask(s2, { title: 'T', projectId, isNext: true })
    const s3 = project([...sphereEvts, ...projEvts, ...taskEvts])
    const taskId = (taskEvts[0] as any).taskId as TaskId

    const updateEvts = updateTask(s3, { taskId, patch: { isNext: false } })
    const s4 = project([...sphereEvts, ...projEvts, ...taskEvts, ...updateEvts])
    expect(s4.tasks.get(taskId)?.isNext).toBeUndefined()
  })

  it('throws when setting isNext true on a project-less task', () => {
    const { sphereEvts, s2, sphereId } = setup()
    const taskEvts = createTask(s2, { title: 'T', sphereId })
    const s3 = project([...sphereEvts, ...taskEvts])
    const taskId = (taskEvts[0] as any).taskId as TaskId

    expect(() =>
      updateTask(s3, { taskId, patch: { isNext: true } })
    ).toThrow('isNext can only be set on tasks that belong to a project')
  })
})
