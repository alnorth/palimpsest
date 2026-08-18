import { describe, test, expect } from 'vitest'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './fixtures'
import { dashboardTasks, processingBuckets, waitingGroups, pickListGroups, agendaView } from './views'

describe('dashboardTasks', () => {
  test('includes tasks due today or earlier, and starred tasks, excludes others', () => {
    const sphere = makeSphere()
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2026-07-30' })
    const dueToday = makeTask({ sphereId: sphere.id, title: 'Today', dueDate: '2026-08-01' })
    const dueLater = makeTask({ sphereId: sphere.id, title: 'Later', dueDate: '2026-08-10' })
    const starredNoDate = makeTask({ sphereId: sphere.id, title: 'Starred', isStarred: true })
    const plain = makeTask({ sphereId: sphere.id, title: 'Plain' })
    const state = buildState({ spheres: [sphere], tasks: [overdue, dueToday, dueLater, starredNoDate, plain] })

    const result = dashboardTasks(state, sphere.id, '2026-08-01')
    expect(result.map(t => t.title)).toEqual(['Overdue', 'Today', 'Starred'])
  })

  test('due tasks sort ascending before non-date-qualifying starred tasks', () => {
    const sphere = makeSphere()
    const starred = makeTask({ sphereId: sphere.id, title: 'Starred', isStarred: true })
    const dueLater = makeTask({ sphereId: sphere.id, title: 'Later', dueDate: '2026-08-01' })
    const dueSooner = makeTask({ sphereId: sphere.id, title: 'Sooner', dueDate: '2026-07-20' })
    const state = buildState({ spheres: [sphere], tasks: [starred, dueLater, dueSooner] })

    const result = dashboardTasks(state, sphere.id, '2026-08-01')
    expect(result.map(t => t.title)).toEqual(['Sooner', 'Later', 'Starred'])
  })

  test('only scopes to the given sphere', () => {
    const sphere = makeSphere()
    const other = makeSphere()
    const inSphere = makeTask({ sphereId: sphere.id, title: 'In', isStarred: true })
    const outOfSphere = makeTask({ sphereId: other.id, title: 'Out', isStarred: true })
    const state = buildState({ spheres: [sphere, other], tasks: [inSphere, outOfSphere] })

    expect(dashboardTasks(state, sphere.id, '2026-08-01').map(t => t.title)).toEqual(['In'])
  })

  test('completed tasks are excluded even if overdue or starred', () => {
    const sphere = makeSphere()
    const completed = makeTask({ sphereId: sphere.id, title: 'Done', status: 'completed', dueDate: '2026-07-01', isStarred: true, completedAt: '2026-07-01T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [completed] })
    expect(dashboardTasks(state, sphere.id, '2026-08-01')).toEqual([])
  })
})

describe('processingBuckets', () => {
  test('actionableTasks: actionable, not waiting, no due date/agenda/context', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const context = makeContext(sphere)
    const bare = makeTask({ sphereId: sphere.id, title: 'Bare', isNext: true })
    const dated = makeTask({ sphereId: sphere.id, title: 'Dated', isNext: true, dueDate: '2026-08-10' })
    const withAgenda = makeTask({ sphereId: sphere.id, title: 'WithAgenda', isNext: true, agendaId: agenda.id })
    const withContext = makeTask({ sphereId: sphere.id, title: 'WithContext', isNext: true, contextId: context.id })
    const waiting = makeTask({ sphereId: sphere.id, title: 'Waiting', isNext: true, waitingFor: { kind: 'review' } })
    const state = buildState({ spheres: [sphere], agendas: [agenda], contexts: [context], tasks: [bare, dated, withAgenda, withContext, waiting] })

    const result = processingBuckets(state)
    expect(result.actionableTasks.map(t => t.title)).toEqual(['Bare'])
  })

  test('projectsWithoutNext: active projects lacking an open isNext task', () => {
    const sphere = makeSphere()
    const withNext = makeProject(sphere, { name: 'HasNext' })
    const withoutNext = makeProject(sphere, { name: 'NoNext' })
    const archivedNoNext = makeProject(sphere, { name: 'ArchivedNoNext', isArchived: true })
    const nextTask = makeTask({ projectId: withNext.id, isNext: true })
    const state = buildState({ spheres: [sphere], projects: [withNext, withoutNext, archivedNoNext], tasks: [nextTask] })

    const result = processingBuckets(state)
    expect(result.projectsWithoutNext.map(p => p.name)).toEqual(['NoNext'])
  })

  test('tasksWaitingOnArchivedProjects: waiting tasks pointing at archived or missing project', () => {
    const sphere = makeSphere()
    const archived = makeProject(sphere, { name: 'Archived', isArchived: true })
    const active = makeProject(sphere, { name: 'Active' })
    const waitingOnArchived = makeTask({ sphereId: sphere.id, title: 'WaitOnArchived', waitingFor: { kind: 'project', projectId: archived.id } })
    const waitingOnActive = makeTask({ sphereId: sphere.id, title: 'WaitOnActive', waitingFor: { kind: 'project', projectId: active.id } })
    const notWaiting = makeTask({ sphereId: sphere.id, title: 'NotWaiting' })
    const state = buildState({ spheres: [sphere], projects: [archived, active], tasks: [waitingOnArchived, waitingOnActive, notWaiting] })

    const result = processingBuckets(state)
    expect(result.tasksWaitingOnArchivedProjects.map(t => t.title)).toEqual(['WaitOnArchived'])
  })

  test('is never sphere-scoped: aggregates across all spheres', () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const taskA = makeTask({ sphereId: sphereA.id, title: 'A', isNext: true })
    const taskB = makeTask({ sphereId: sphereB.id, title: 'B', isNext: true })
    const state = buildState({ spheres: [sphereA, sphereB], tasks: [taskA, taskB] })

    const result = processingBuckets(state)
    expect(result.actionableTasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('waitingGroups', () => {
  test('groups open waiting tasks by kind, in fixed order, omitting empty kinds', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const agenda = makeAgenda(sphere)
    const projectTask = makeTask({ sphereId: sphere.id, title: 'ProjectWait', waitingFor: { kind: 'project', projectId: project.id } })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'ReviewWait', waitingFor: { kind: 'review' } })
    const agendaTask = makeTask({ sphereId: sphere.id, title: 'AgendaWait', waitingFor: { kind: 'agenda', agendaId: agenda.id } })
    const state = buildState({ spheres: [sphere], projects: [project], agendas: [agenda], tasks: [projectTask, reviewTask, agendaTask] })

    const groups = waitingGroups(state, sphere.id)
    expect(groups.map(g => g.kind)).toEqual(['review', 'agenda', 'project'])
    expect(groups.find(g => g.kind === 'review')?.tasks.map(t => t.title)).toEqual(['ReviewWait'])
  })

  test('excludes non-waiting and completed tasks', () => {
    const sphere = makeSphere()
    const notWaiting = makeTask({ sphereId: sphere.id, title: 'NotWaiting' })
    const state = buildState({ spheres: [sphere], tasks: [notWaiting] })
    expect(waitingGroups(state, sphere.id)).toEqual([])
  })

  test('sphere is optional: omitting it aggregates across all spheres', () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const taskA = makeTask({ sphereId: sphereA.id, title: 'A', waitingFor: { kind: 'review' } })
    const taskB = makeTask({ sphereId: sphereB.id, title: 'B', waitingFor: { kind: 'review' } })
    const state = buildState({ spheres: [sphereA, sphereB], tasks: [taskA, taskB] })

    const groups = waitingGroups(state)
    expect(groups[0]?.tasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('pickListGroups', () => {
  test('groups actionable+context tasks by context, in the sphere\'s context order', () => {
    const sphere = makeSphere()
    const phone = makeContext(sphere, { name: 'Phone' })
    const email = makeContext(sphere, { name: 'Email' })
    const phoneTask = makeTask({ sphereId: sphere.id, title: 'CallSomeone', isNext: true, contextId: phone.id })
    const emailTask = makeTask({ sphereId: sphere.id, title: 'SendEmail', isNext: true, contextId: email.id })
    const noContext = makeTask({ sphereId: sphere.id, title: 'NoContext', isNext: true })
    const state = buildState({ spheres: [sphere], contexts: [phone, email], tasks: [phoneTask, emailTask, noContext] })

    const groups = pickListGroups(state, sphere.id)
    expect(groups.map(g => g.context.name)).toEqual(['Phone', 'Email'])
    expect(groups.find(g => g.context.name === 'Email')?.tasks.map(t => t.title)).toEqual(['SendEmail'])
  })

  test('omits contexts with no eligible tasks', () => {
    const sphere = makeSphere()
    const used = makeContext(sphere, { name: 'Used' })
    const unused = makeContext(sphere, { name: 'Unused' })
    const task = makeTask({ sphereId: sphere.id, isNext: true, contextId: used.id })
    const state = buildState({ spheres: [sphere], contexts: [used, unused], tasks: [task] })

    const groups = pickListGroups(state, sphere.id)
    expect(groups.map(g => g.context.name)).toEqual(['Used'])
  })

  test('excludes non-actionable tasks even with a context', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere)
    const context = makeContext(sphere)
    // has a project and isNext is not set, so it is not actionable (actionable requires no project OR isNext)
    const notActionable = makeTask({ projectId: project.id, contextId: context.id })
    const state = buildState({ spheres: [sphere], projects: [project], contexts: [context], tasks: [notActionable] })
    expect(pickListGroups(state, sphere.id)).toEqual([])
  })
})

describe('agendaView', () => {
  test('free-floating task tagged with the agenda is included even without isNext', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const task = makeTask({ sphereId: sphere.id, title: 'FreeFloating', agendaId: agenda.id })
    const state = buildState({ spheres: [sphere], agendas: [agenda], tasks: [task] })

    const result = agendaView(state, agenda.id, '2026-08-01')
    expect(result.activeTasks.map(t => t.title)).toEqual(['FreeFloating'])
  })

  test('task in a real project tagged with the agenda needs isNext to be included', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere)
    const notNext = makeTask({ projectId: project.id, title: 'NotNext', agendaId: agenda.id })
    const isNext = makeTask({ projectId: project.id, title: 'IsNext', agendaId: agenda.id, isNext: true })
    const state = buildState({ spheres: [sphere], agendas: [agenda], projects: [project], tasks: [notNext, isNext] })

    const result = agendaView(state, agenda.id, '2026-08-01')
    expect(result.activeTasks.map(t => t.title)).toEqual(['IsNext'])
  })

  test('excludes tasks without this agendaId regardless of project/isNext', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const other = makeAgenda(sphere)
    const task = makeTask({ sphereId: sphere.id, title: 'OtherAgenda', agendaId: other.id })
    const state = buildState({ spheres: [sphere], agendas: [agenda, other], tasks: [task] })

    expect(agendaView(state, agenda.id, '2026-08-01').activeTasks).toEqual([])
  })

  test('due-date filter: undated and due-today/overdue included, future excluded', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const undated = makeTask({ sphereId: sphere.id, title: 'Undated', agendaId: agenda.id })
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', agendaId: agenda.id, dueDate: '2026-07-30' })
    const dueToday = makeTask({ sphereId: sphere.id, title: 'DueToday', agendaId: agenda.id, dueDate: '2026-08-01' })
    const future = makeTask({ sphereId: sphere.id, title: 'Future', agendaId: agenda.id, dueDate: '2026-08-10' })
    const state = buildState({ spheres: [sphere], agendas: [agenda], tasks: [undated, overdue, dueToday, future] })

    const result = agendaView(state, agenda.id, '2026-08-01')
    expect(result.activeTasks.map(t => t.title).sort()).toEqual(['DueToday', 'Overdue', 'Undated'])
  })

  test('splits into waiting/active by waitingFor, independent of which criterion matched', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const project = makeProject(sphere)
    const waitingFreeFloating = makeTask({
      sphereId: sphere.id, title: 'WaitingFreeFloating', agendaId: agenda.id, waitingFor: { kind: 'review' },
    })
    const waitingInProject = makeTask({
      projectId: project.id, title: 'WaitingInProject', agendaId: agenda.id, isNext: true, waitingFor: { kind: 'review' },
    })
    const activeFreeFloating = makeTask({ sphereId: sphere.id, title: 'ActiveFreeFloating', agendaId: agenda.id })
    const state = buildState({
      spheres: [sphere], agendas: [agenda], projects: [project],
      tasks: [waitingFreeFloating, waitingInProject, activeFreeFloating],
    })

    const result = agendaView(state, agenda.id, '2026-08-01')
    expect(result.waitingTasks.map(t => t.title).sort()).toEqual(['WaitingFreeFloating', 'WaitingInProject'])
    expect(result.activeTasks.map(t => t.title)).toEqual(['ActiveFreeFloating'])
  })

  test('projects: non-archived projects linked to this agenda, populated even with no eligible tasks', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const other = makeAgenda(sphere)
    const linked = makeProject(sphere, { name: 'Linked', agendaId: agenda.id })
    const archivedLinked = makeProject(sphere, { name: 'ArchivedLinked', agendaId: agenda.id, isArchived: true })
    const otherAgendaProject = makeProject(sphere, { name: 'OtherAgenda', agendaId: other.id })
    const unlinked = makeProject(sphere, { name: 'Unlinked' })
    const state = buildState({
      spheres: [sphere], agendas: [agenda, other],
      projects: [linked, archivedLinked, otherAgendaProject, unlinked],
    })

    const result = agendaView(state, agenda.id, '2026-08-01')
    expect(result.projects.map(p => p.name)).toEqual(['Linked'])
    expect(result.activeTasks).toEqual([])
    expect(result.waitingTasks).toEqual([])
  })
})
