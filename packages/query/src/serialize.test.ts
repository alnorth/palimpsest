import { describe, test, expect } from 'vitest'
import type { ProjectId, AgendaId } from '@alnorth/palimpsest'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './fixtures'
import {
  toTaskJson, toProjectJson, toSphereJson, toAgendaJson, toContextJson,
  computeProjectStats, computeProjectNextTasks, computeProjectStatsAndNextTasks, computeSingleProjectStats,
} from './serialize'

describe('toTaskJson', () => {
  test('task with a project denormalizes sphere via the project', () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Website' })
    const task = makeTask({ title: 'Ship it', projectId: project.id })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })

    expect(toTaskJson(state, task)).toEqual({
      id: task.id,
      title: 'Ship it',
      description: '',
      status: 'open',
      sphere: { id: sphere.id, name: 'Work' },
      project: { id: project.id, name: 'Website' },
      agenda: null,
      context: null,
      dueDate: null,
      recurrence: null,
      isNext: false,
      isStarred: false,
      waitingFor: null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: null,
    })
  })

  test('task with a direct sphereId (no project)', () => {
    const sphere = makeSphere({ name: 'Personal' })
    const task = makeTask({ title: 'Buy milk', sphereId: sphere.id })
    const state = buildState({ spheres: [sphere], tasks: [task] })

    const json = toTaskJson(state, task)
    expect(json.sphere).toEqual({ id: sphere.id, name: 'Personal' })
    expect(json.project).toBeNull()
  })

  test('task with agenda, context, recurrence, and flags set', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Weekly sync' })
    const context = makeContext(sphere, { name: 'Email' })
    const task = makeTask({
      sphereId: sphere.id,
      agendaId: agenda.id,
      contextId: context.id,
      dueDate: '2026-08-03',
      dueDateExpression: 'weekly',
      isNext: true,
      isStarred: true,
    })
    const state = buildState({ spheres: [sphere], agendas: [agenda], contexts: [context], tasks: [task] })

    const json = toTaskJson(state, task)
    expect(json.agenda).toEqual({ id: agenda.id, name: 'Weekly sync' })
    expect(json.context).toEqual({ id: context.id, name: 'Email' })
    expect(json.dueDate).toBe('2026-08-03')
    expect(json.recurrence).toBe('weekly')
    expect(json.isNext).toBe(true)
    expect(json.isStarred).toBe(true)
  })

  test('waitingFor: review', () => {
    const task = makeTask({ sphereId: makeSphere().id, waitingFor: { kind: 'review' } })
    const state = buildState({ tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'review' })
  })

  test('waitingFor: agenda denormalizes agenda title as name', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const task = makeTask({ sphereId: sphere.id, waitingFor: { kind: 'agenda', agendaId: agenda.id } })
    const state = buildState({ spheres: [sphere], agendas: [agenda], tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'agenda', id: agenda.id, name: 'Jim' })
  })

  test('waitingFor: project denormalizes project name', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Redesign' })
    const task = makeTask({ sphereId: sphere.id, waitingFor: { kind: 'project', projectId: project.id } })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'project', id: project.id, name: 'Redesign' })
  })

  test('waitingFor: trello carries the card url', () => {
    const task = makeTask({ sphereId: makeSphere().id, waitingFor: { kind: 'trello', cardUrl: 'https://trello.example/c/1' } })
    const state = buildState({ tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'trello', cardUrl: 'https://trello.example/c/1' })
  })

  test('waitingFor: dangling agendaId resolves to name: null rather than an empty string', () => {
    const task = makeTask({ sphereId: makeSphere().id, waitingFor: { kind: 'agenda', agendaId: 'missing' as AgendaId } })
    const state = buildState({ tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'agenda', id: 'missing', name: null })
  })

  test('waitingFor: dangling projectId resolves to name: null rather than an empty string', () => {
    const task = makeTask({ sphereId: makeSphere().id, waitingFor: { kind: 'project', projectId: 'missing' as ProjectId } })
    const state = buildState({ tasks: [task] })
    expect(toTaskJson(state, task).waitingFor).toEqual({ kind: 'project', id: 'missing', name: null })
  })

  test('completed task exposes completedAt', () => {
    const task = makeTask({ sphereId: makeSphere().id, status: 'completed', completedAt: '2026-07-01T00:00:00.000Z' })
    const state = buildState({ tasks: [task] })
    const json = toTaskJson(state, task)
    expect(json.status).toBe('completed')
    expect(json.completedAt).toBe('2026-07-01T00:00:00.000Z')
  })

  test('dangling agendaId (agenda not in state) resolves to null rather than throwing', () => {
    const task = makeTask({ sphereId: makeSphere().id, agendaId: 'missing' as AgendaId })
    const state = buildState({ tasks: [task] })
    expect(toTaskJson(state, task).agenda).toBeNull()
  })
})

describe('project/sphere/agenda/context serialization', () => {
  test('toSphereJson', () => {
    const sphere = makeSphere({ name: 'Work', description: 'day job' })
    expect(toSphereJson(sphere)).toEqual({ id: sphere.id, name: 'Work', description: 'day job' })
  })

  test('toSphereJson with no description', () => {
    const sphere = makeSphere({ name: 'Work' })
    expect(toSphereJson(sphere)).toEqual({ id: sphere.id, name: 'Work', description: null })
  })

  test('toProjectJson includes stats and sphere ref', () => {
    const sphere = makeSphere({ name: 'Work' })
    const project = makeProject(sphere, { name: 'Website' })
    const openTask = makeTask({ projectId: project.id, isNext: true })
    const completedTask = makeTask({ projectId: project.id, status: 'completed' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [openTask, completedTask] })
    const stats = computeProjectStats(state)

    expect(toProjectJson(state, project, stats.get(project.id)!)).toEqual({
      id: project.id,
      name: 'Website',
      description: null,
      sphere: { id: sphere.id, name: 'Work' },
      agenda: null,
      isSelfOnly: false,
      isArchived: false,
      openTaskCount: 1,
      hasNextAction: true,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: null,
    })
  })

  test('toProjectJson: isSelfOnly true when the project has isSelfOnly set', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { isSelfOnly: true })
    const state = buildState({ spheres: [sphere], projects: [project] })
    const stats = computeProjectStats(state)
    expect(toProjectJson(state, project, stats.get(project.id)!).isSelfOnly).toBe(true)
  })

  test('toProjectJson resolves agenda ref when the project is linked to an agenda', () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const project = makeProject(sphere, { agendaId: agenda.id })
    const state = buildState({ spheres: [sphere], agendas: [agenda], projects: [project] })
    const stats = computeProjectStats(state)
    expect(toProjectJson(state, project, stats.get(project.id)!).agenda).toEqual({ id: agenda.id, name: 'Jim' })
  })

  test('toProjectJson: dangling agendaId (agenda not in state) resolves to null rather than throwing', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { agendaId: 'missing' as AgendaId })
    const state = buildState({ spheres: [sphere], projects: [project] })
    const stats = computeProjectStats(state)
    expect(toProjectJson(state, project, stats.get(project.id)!).agenda).toBeNull()
  })

  test('computeProjectStats: project with only non-next open tasks has hasNextAction false', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const task = makeTask({ projectId: project.id })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })
    const stats = computeProjectStats(state)
    expect(stats.get(project.id)).toEqual({ openTaskCount: 1, hasNextAction: false })
  })

  test('toProjectJson omits nextTasks when not passed', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const state = buildState({ spheres: [sphere], projects: [project] })
    const stats = computeProjectStats(state)

    expect(toProjectJson(state, project, stats.get(project.id)!)).not.toHaveProperty('nextTasks')
  })

  test('toProjectJson includes nextTasks as TaskJson when passed', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const nextTask = makeTask({ projectId: project.id, isNext: true, title: 'Next one' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [nextTask] })
    const stats = computeProjectStats(state)

    const result = toProjectJson(state, project, stats.get(project.id)!, [nextTask])
    expect(result.nextTasks).toEqual([toTaskJson(state, nextTask)])
  })

  test('toProjectJson includes an empty nextTasks array when passed one', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const state = buildState({ spheres: [sphere], projects: [project] })
    const stats = computeProjectStats(state)

    expect(toProjectJson(state, project, stats.get(project.id)!, [])).toEqual(
      expect.objectContaining({ nextTasks: [] }),
    )
  })

  test('computeProjectNextTasks: only open isNext tasks, grouped by project', () => {
    const sphere = makeSphere()
    const projectA = makeProject(sphere, { name: 'A' })
    const projectB = makeProject(sphere, { name: 'B' })
    const nextA = makeTask({ projectId: projectA.id, isNext: true, title: 'Next A' })
    const notNextA = makeTask({ projectId: projectA.id, title: 'Not next A' })
    const completedNextA = makeTask({ projectId: projectA.id, isNext: true, status: 'completed', title: 'Done next A' })
    const nextB = makeTask({ projectId: projectB.id, isNext: true, title: 'Next B' })
    const state = buildState({
      spheres: [sphere],
      projects: [projectA, projectB],
      tasks: [nextA, notNextA, completedNextA, nextB],
    })

    const map = computeProjectNextTasks(state)
    expect(map.get(projectA.id)).toEqual([nextA])
    expect(map.get(projectB.id)).toEqual([nextB])
  })

  test('computeProjectNextTasks: project with no next task is absent from the map', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const state = buildState({ spheres: [sphere], projects: [project] })

    expect(computeProjectNextTasks(state).get(project.id)).toBeUndefined()
  })

  test('computeProjectNextTasks: a project with multiple next tasks includes all of them', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const first = makeTask({ projectId: project.id, isNext: true, title: 'First next' })
    const second = makeTask({ projectId: project.id, isNext: true, title: 'Second next' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [first, second] })

    expect(computeProjectNextTasks(state).get(project.id)).toEqual([first, second])
  })

  test('computeProjectNextTasks: a next task that is waiting is still included', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const waitingNext = makeTask({
      projectId: project.id, isNext: true, title: 'Waiting next', waitingFor: { kind: 'review' },
    })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [waitingNext] })

    expect(computeProjectNextTasks(state).get(project.id)).toEqual([waitingNext])
  })

  test('computeProjectStatsAndNextTasks: matches computeProjectStats and computeProjectNextTasks in one pass', () => {
    const sphere = makeSphere()
    const projectA = makeProject(sphere, { name: 'A' })
    const projectB = makeProject(sphere, { name: 'B' })
    const nextA = makeTask({ projectId: projectA.id, isNext: true, title: 'Next A' })
    const notNextA = makeTask({ projectId: projectA.id, title: 'Not next A' })
    const state = buildState({
      spheres: [sphere], projects: [projectA, projectB], tasks: [nextA, notNextA],
    })

    const { stats, nextTasksByProject } = computeProjectStatsAndNextTasks(state)
    expect(stats).toEqual(computeProjectStats(state))
    expect(nextTasksByProject).toEqual(computeProjectNextTasks(state))
  })

  test('computeSingleProjectStats: matches computeProjectStats\' entry for that project', () => {
    const sphere = makeSphere()
    const projectA = makeProject(sphere, { name: 'A' })
    const projectB = makeProject(sphere, { name: 'B' })
    const nextA = makeTask({ projectId: projectA.id, isNext: true, title: 'Next A' })
    const notNextA = makeTask({ projectId: projectA.id, title: 'Not next A' })
    const openB = makeTask({ projectId: projectB.id, title: 'Open B' })
    const state = buildState({
      spheres: [sphere], projects: [projectA, projectB], tasks: [nextA, notNextA, openB],
    })

    expect(computeSingleProjectStats(state, projectA.id)).toEqual(computeProjectStats(state).get(projectA.id))
    expect(computeSingleProjectStats(state, projectB.id)).toEqual(computeProjectStats(state).get(projectB.id))
  })

  test('computeSingleProjectStats: a project with no open tasks gets the zero-value default', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const state = buildState({ spheres: [sphere], projects: [project] })

    expect(computeSingleProjectStats(state, project.id)).toEqual({ openTaskCount: 0, hasNextAction: false })
  })

  test('computeSingleProjectStats: ignores completed tasks and other projects\' tasks', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'A' })
    const other = makeProject(sphere, { name: 'B' })
    const completed = makeTask({ projectId: project.id, status: 'completed', isNext: true })
    const otherOpen = makeTask({ projectId: other.id, isNext: true })
    const state = buildState({ spheres: [sphere], projects: [project, other], tasks: [completed, otherOpen] })

    expect(computeSingleProjectStats(state, project.id)).toEqual({ openTaskCount: 0, hasNextAction: false })
  })

  test('toAgendaJson maps title to name and includes sphere ref', () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Weekly sync' })
    const state = buildState({ spheres: [sphere], agendas: [agenda] })
    expect(toAgendaJson(state, agenda)).toEqual({
      id: agenda.id,
      name: 'Weekly sync',
      sphere: { id: sphere.id, name: 'Work' },
    })
  })

  test('toContextJson includes description', () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: 'Email', description: 'inbox-only' })
    const state = buildState({ spheres: [sphere], contexts: [context] })
    expect(toContextJson(state, context)).toEqual({
      id: context.id,
      name: 'Email',
      sphere: { id: sphere.id, name: 'Work' },
      description: 'inbox-only',
    })
  })
})
