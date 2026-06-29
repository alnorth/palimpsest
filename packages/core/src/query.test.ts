import { describe, it, expect } from 'vitest'
import { createEmptyState, project } from './projection.js'
import { buildStateFromConfig } from './config.js'
import { createProject, createTask, completeTask, updateTask } from './commands.js'
import { listTasksBySphere, listOpenTasks, getTaskSphereId, listTasks } from './query.js'
import type { SphereId, ProjectId, TaskId } from './ids.js'
import type { PalimpsestEvent } from './events.js'

const sphereId = 'sph1' as SphereId
const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: sphereId, name: 'Work', agendas: [], contexts: [] }]) }

function setup() {
  const projEvts = createProject({ sphereId, name: 'Project A' })
  const s1 = project(projEvts, baseState)
  const projId = (projEvts[0] as any).projectId as ProjectId

  const taskViaProject = createTask({ title: 'Task via project', projectId: projId })
  const taskDirectSphere = createTask({ title: 'Task direct sphere', sphereId })

  const allEvents: PalimpsestEvent[] = [...projEvts, ...taskViaProject, ...taskDirectSphere]
  const state = project(allEvents, baseState)
  const task1Id = (taskViaProject[0] as any).taskId as TaskId
  const task2Id = (taskDirectSphere[0] as any).taskId as TaskId

  return { state, sphereId, projId, task1Id, task2Id }
}

describe('listTasksBySphere', () => {
  it('returns tasks belonging to sphere via project', () => {
    const { state, task1Id } = setup()
    const tasks = listTasksBySphere(state, sphereId)
    expect(tasks.map(t => t.id)).toContain(task1Id)
  })

  it('returns tasks belonging directly to sphere', () => {
    const { state, task2Id } = setup()
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


describe('listOpenTasks', () => {
  it('returns only open tasks', () => {
    const { state } = setup()
    const tasks = listOpenTasks(state)
    expect(tasks.every(t => t.status === 'open')).toBe(true)
  })
})

describe('listTasks isActionable', () => {
  it('includes project-less open tasks', () => {
    const { state, task2Id } = setup()
    const tasks = listTasks(state, { isActionable: true })
    expect(tasks.map(t => t.id)).toContain(task2Id)
  })

  it('includes project tasks marked isNext', () => {
    const { state, task1Id } = setup()
    const task = state.tasks.get(task1Id)!
    const updated = project(updateTask(task, { isNext: true }), state)
    const tasks = listTasks(updated, { isActionable: true })
    expect(tasks.map(t => t.id)).toContain(task1Id)
  })

  it('excludes project tasks not marked isNext', () => {
    const { state, task1Id } = setup()
    const tasks = listTasks(state, { isActionable: true })
    expect(tasks.map(t => t.id)).not.toContain(task1Id)
  })

  it('excludes completed tasks', () => {
    const { state, task2Id } = setup()
    const task = state.tasks.get(task2Id)!
    const updated = project(completeTask(task), state)
    const tasks = listTasks(updated, { isActionable: true })
    expect(tasks.map(t => t.id)).not.toContain(task2Id)
  })

  it('excludes completed isNext tasks', () => {
    const { state, task1Id } = setup()
    const task = state.tasks.get(task1Id)!
    const withNext = project(updateTask(task, { isNext: true }), state)
    const withNextTask = withNext.tasks.get(task1Id)!
    const completed = project(completeTask(withNextTask), withNext)
    const tasks = listTasks(completed, { isActionable: true })
    expect(tasks.map(t => t.id)).not.toContain(task1Id)
  })
})

describe('getTaskSphereId', () => {
  it('resolves sphere from project for project tasks', () => {
    const { state, task1Id } = setup()
    const task = state.tasks.get(task1Id)!
    expect(getTaskSphereId(state, task)).toBe(sphereId)
  })

  it('returns direct sphereId for project-less tasks', () => {
    const { state, task2Id } = setup()
    const task = state.tasks.get(task2Id)!
    expect(getTaskSphereId(state, task)).toBe(sphereId)
  })
})
