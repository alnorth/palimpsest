import { describe, it, expect } from 'vitest'
import { project } from './projection.js'
import { createSphere, createProject, createTask } from './commands.js'
import { listTasksBySphere, listTasksByProject, listOpenTasks, getTaskSphereId } from './query.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'
import type { PalimpsestEvent } from './events.js'
import { createEmptyState } from './projection.js'

function setup() {
  const sphereEvts = createSphere(createEmptyState(), { name: 'Work' })
  const s1 = project(sphereEvts)
  const sphereId = (sphereEvts[0] as any).sphereId as SphereId

  const projEvts = createProject(s1, { sphereId, name: 'Project A' })
  const s2 = project([...sphereEvts, ...projEvts])
  const projId = (projEvts[0] as any).projectId as ProjectId

  // Task belonging to project (inherits sphere)
  const taskViaProject = createTask(s2, { title: 'Task via project', projectId: projId })
  // Task belonging directly to sphere
  const taskDirectSphere = createTask(s2, { title: 'Task direct sphere', sphereId })

  const allEvents: PalimpsestEvent[] = [
    ...sphereEvts, ...projEvts, ...taskViaProject, ...taskDirectSphere,
  ]
  const state = project(allEvents)
  const task1Id = (taskViaProject[0] as any).taskId as TaskId
  const task2Id = (taskDirectSphere[0] as any).taskId as TaskId

  return { state, sphereId, projId, task1Id, task2Id }
}

describe('listTasksBySphere', () => {
  it('returns tasks belonging to sphere via project', () => {
    const { state, sphereId, task1Id } = setup()
    const tasks = listTasksBySphere(state, sphereId)
    expect(tasks.map(t => t.id)).toContain(task1Id)
  })

  it('returns tasks belonging directly to sphere', () => {
    const { state, sphereId, task2Id } = setup()
    const tasks = listTasksBySphere(state, sphereId)
    expect(tasks.map(t => t.id)).toContain(task2Id)
  })

  it('does not return tasks from a different sphere', () => {
    const { state, task1Id, task2Id } = setup()
    const tasks = listTasksBySphere(state, 'other-sphere' as SphereId)
    expect(tasks.map(t => t.id)).not.toContain(task1Id)
    expect(tasks.map(t => t.id)).not.toContain(task2Id)
  })
})

describe('listTasksByProject', () => {
  it('returns only tasks in the given project', () => {
    const { state, projId, task1Id, task2Id } = setup()
    const tasks = listTasksByProject(state, projId)
    expect(tasks.map(t => t.id)).toContain(task1Id)
    expect(tasks.map(t => t.id)).not.toContain(task2Id)
  })
})

describe('listOpenTasks', () => {
  it('returns only open tasks', () => {
    const { state } = setup()
    const tasks = listOpenTasks(state)
    expect(tasks.every(t => t.status === 'open')).toBe(true)
  })
})

describe('getTaskSphereId', () => {
  it('resolves sphere from project for project tasks', () => {
    const { state, sphereId, task1Id } = setup()
    const task = state.tasks.get(task1Id)!
    expect(getTaskSphereId(state, task)).toBe(sphereId)
  })

  it('returns direct sphereId for project-less tasks', () => {
    const { state, sphereId, task2Id } = setup()
    const task = state.tasks.get(task2Id)!
    expect(getTaskSphereId(state, task)).toBe(sphereId)
  })
})
