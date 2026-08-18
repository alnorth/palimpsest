import { describe, test, expect } from 'vitest'
import type { TaskId } from '@alnorth/palimpsest'
import { makeSphere, makeProject, makeAgenda, makeContext, makeTask, buildState } from './fixtures'
import { runQuery } from './runQuery'

describe('tasks: default filtering and ordering', () => {
  test('defaults to open status only', () => {
    const sphere = makeSphere()
    const open = makeTask({ sphereId: sphere.id, title: 'Open' })
    const completed = makeTask({ sphereId: sphere.id, title: 'Done', status: 'completed', completedAt: '2026-07-01T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [open, completed] })

    const result = runQuery(state, { kind: 'tasks' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Open'])
  })

  test('status completed sorts by completedAt descending', () => {
    const sphere = makeSphere()
    const older = makeTask({ sphereId: sphere.id, title: 'Older', status: 'completed', completedAt: '2026-07-01T00:00:00.000Z' })
    const newer = makeTask({ sphereId: sphere.id, title: 'Newer', status: 'completed', completedAt: '2026-07-15T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [older, newer] })

    const result = runQuery(state, { kind: 'tasks', status: 'completed' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Newer', 'Older'])
  })

  test('default ordering is dueDate ascending, undated last, tie-broken by createdAt', () => {
    const sphere = makeSphere()
    const undated = makeTask({ sphereId: sphere.id, title: 'Undated', createdAt: '2026-01-01T00:00:00.000Z' })
    const dueLater = makeTask({ sphereId: sphere.id, title: 'Later', dueDate: '2026-08-10', createdAt: '2026-01-02T00:00:00.000Z' })
    const dueSooner = makeTask({ sphereId: sphere.id, title: 'Sooner', dueDate: '2026-08-01', createdAt: '2026-01-03T00:00:00.000Z' })
    const state = buildState({ spheres: [sphere], tasks: [undated, dueLater, dueSooner] })

    const result = runQuery(state, { kind: 'tasks' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Sooner', 'Later', 'Undated'])
  })

  test('status any includes deleted tasks', () => {
    const sphere = makeSphere()
    const deleted = makeTask({ sphereId: sphere.id, title: 'Gone', status: 'deleted' })
    const state = buildState({ spheres: [sphere], tasks: [deleted] })

    const openResult = runQuery(state, { kind: 'tasks' }) as { tasks: unknown[] }
    expect(openResult.tasks).toEqual([])

    const anyResult = runQuery(state, { kind: 'tasks', status: 'any' }) as { tasks: { title: string }[] }
    expect(anyResult.tasks.map(t => t.title)).toEqual(['Gone'])
  })

  test('empty result set is a normal success, not an error', () => {
    const state = buildState({})
    const result = runQuery(state, { kind: 'tasks' }) as { count: number; total: number; tasks: unknown[] }
    expect(result).toEqual({ count: 0, total: 0, truncated: false, tasks: [] })
  })
})

describe('tasks: filters', () => {
  test('sphere + context filters combine', () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const context = makeContext(sphere, { name: 'Email' })
    const match = makeTask({ sphereId: sphere.id, contextId: context.id, title: 'Match' })
    const wrongContext = makeTask({ sphereId: sphere.id, title: 'WrongContext' })
    const wrongSphere = makeTask({ sphereId: otherSphere.id, contextId: context.id, title: 'WrongSphere' })
    const state = buildState({ spheres: [sphere, otherSphere], contexts: [context], tasks: [match, wrongContext, wrongSphere] })

    const result = runQuery(state, { kind: 'tasks', sphere: 'Work', context: 'Email' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Match'])
  })

  test('archived project tasks excluded by default, included with includeArchived', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { isArchived: true })
    const task = makeTask({ projectId: project.id, title: 'InArchivedProject' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [task] })

    const excluded = runQuery(state, { kind: 'tasks' }) as { tasks: unknown[] }
    expect(excluded.tasks).toEqual([])

    const included = runQuery(state, { kind: 'tasks', includeArchived: true }) as { tasks: { title: string }[] }
    expect(included.tasks.map(t => t.title)).toEqual(['InArchivedProject'])
  })

  test('dueBefore with injected today returns only overdue tasks', () => {
    const sphere = makeSphere()
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2026-07-30' })
    const dueToday = makeTask({ sphereId: sphere.id, title: 'Today', dueDate: '2026-08-01' })
    const state = buildState({ spheres: [sphere], tasks: [overdue, dueToday] })

    const result = runQuery(state, { kind: 'tasks', dueBefore: 'today' }, { today: '2026-08-01' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Overdue'])
  })

  test('dueOn with injected today matches exactly', () => {
    const sphere = makeSphere()
    const dueToday = makeTask({ sphereId: sphere.id, title: 'Today', dueDate: '2026-08-01' })
    const dueTomorrow = makeTask({ sphereId: sphere.id, title: 'Tomorrow', dueDate: '2026-08-02' })
    const state = buildState({ spheres: [sphere], tasks: [dueToday, dueTomorrow] })

    const result = runQuery(state, { kind: 'tasks', dueOn: 'today' }, { today: '2026-08-01' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Today'])
  })

  test('limit truncates and reports total/truncated', () => {
    const sphere = makeSphere()
    const tasks = [1, 2, 3].map(n => makeTask({ sphereId: sphere.id, title: `Task ${n}`, dueDate: `2026-08-0${n}` }))
    const state = buildState({ spheres: [sphere], tasks })

    const result = runQuery(state, { kind: 'tasks', limit: 2 }) as { count: number; total: number; truncated: boolean; tasks: unknown[] }
    expect(result).toMatchObject({ count: 2, total: 3, truncated: true })
  })

  test('limit that does not bite reports truncated false', () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id })
    const state = buildState({ spheres: [sphere], tasks: [task] })

    const result = runQuery(state, { kind: 'tasks', limit: 5 }) as { total: number; truncated: boolean }
    expect(result).toMatchObject({ total: 1, truncated: false })
  })

  test('hasDueDate / withoutDueDate', () => {
    const sphere = makeSphere()
    const dated = makeTask({ sphereId: sphere.id, title: 'Dated', dueDate: '2026-08-10' })
    const undated = makeTask({ sphereId: sphere.id, title: 'Undated' })
    const state = buildState({ spheres: [sphere], tasks: [dated, undated] })

    const withDate = runQuery(state, { kind: 'tasks', hasDueDate: true }) as { tasks: { title: string }[] }
    expect(withDate.tasks.map(t => t.title)).toEqual(['Dated'])

    const withoutDate = runQuery(state, { kind: 'tasks', withoutDueDate: true }) as { tasks: { title: string }[] }
    expect(withoutDate.tasks.map(t => t.title)).toEqual(['Undated'])
  })

  test('hasAgenda / withoutAgenda', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Standup' })
    const linked = makeTask({ sphereId: sphere.id, agendaId: agenda.id, title: 'Linked' })
    const unlinked = makeTask({ sphereId: sphere.id, title: 'Unlinked' })
    const state = buildState({ spheres: [sphere], agendas: [agenda], tasks: [linked, unlinked] })

    const withAgenda = runQuery(state, { kind: 'tasks', hasAgenda: true }) as { tasks: { title: string }[] }
    expect(withAgenda.tasks.map(t => t.title)).toEqual(['Linked'])

    const withoutAgenda = runQuery(state, { kind: 'tasks', withoutAgenda: true }) as { tasks: { title: string }[] }
    expect(withoutAgenda.tasks.map(t => t.title)).toEqual(['Unlinked'])
  })

  test('hasContext / withoutContext', () => {
    const sphere = makeSphere()
    const context = makeContext(sphere, { name: 'Email' })
    const linked = makeTask({ sphereId: sphere.id, contextId: context.id, title: 'Linked' })
    const unlinked = makeTask({ sphereId: sphere.id, title: 'Unlinked' })
    const state = buildState({ spheres: [sphere], contexts: [context], tasks: [linked, unlinked] })

    const withContext = runQuery(state, { kind: 'tasks', hasContext: true }) as { tasks: { title: string }[] }
    expect(withContext.tasks.map(t => t.title)).toEqual(['Linked'])

    const withoutContext = runQuery(state, { kind: 'tasks', withoutContext: true }) as { tasks: { title: string }[] }
    expect(withoutContext.tasks.map(t => t.title)).toEqual(['Unlinked'])
  })

  test('actionable + withoutDueDate + withoutAgenda + withoutContext composes (the "processing" inbox query)', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const context = makeContext(sphere)
    const bareActionable = makeTask({ sphereId: sphere.id, title: 'Bare', isNext: true })
    const datedActionable = makeTask({ sphereId: sphere.id, title: 'Dated', isNext: true, dueDate: '2026-08-10' })
    const withAgendaActionable = makeTask({ sphereId: sphere.id, title: 'HasAgenda', isNext: true, agendaId: agenda.id })
    const withContextActionable = makeTask({ sphereId: sphere.id, title: 'HasContext', isNext: true, contextId: context.id })
    const state = buildState({
      spheres: [sphere], agendas: [agenda], contexts: [context],
      tasks: [bareActionable, datedActionable, withAgendaActionable, withContextActionable],
    })

    const result = runQuery(state, {
      kind: 'tasks', actionable: true, withoutDueDate: true, withoutAgenda: true, withoutContext: true,
    }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Bare'])
  })
})

describe('tasks: errors', () => {
  test('unresolved sphere name throws a readable error', () => {
    const state = buildState({ spheres: [makeSphere({ name: 'Work' })] })
    expect(() => runQuery(state, { kind: 'tasks', sphere: 'Nope' })).toThrowError(/No sphere matching "Nope"/)
  })

  test('ambiguous project name across spheres throws', () => {
    const workSphere = makeSphere({ name: 'Work' })
    const personalSphere = makeSphere({ name: 'Personal' })
    const workWebsite = makeProject(workSphere, { name: 'Website' })
    const personalWebsite = makeProject(personalSphere, { name: 'Website' })
    const state = buildState({ spheres: [workSphere, personalSphere], projects: [workWebsite, personalWebsite] })
    expect(() => runQuery(state, { kind: 'tasks', project: 'Website' })).toThrowError(/Ambiguous project "Website"/)
  })
})

describe('task <id>', () => {
  test('returns the task by id', () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, title: 'Find me' })
    const state = buildState({ spheres: [sphere], tasks: [task] })
    const result = runQuery(state, { kind: 'task', id: task.id }) as { task: { title: string } }
    expect(result.task.title).toBe('Find me')
  })

  test('unknown id throws not-found', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'task', id: 'missing' as TaskId })).toThrowError(/No task with id "missing"/)
  })
})

describe('projects', () => {
  test('includes openTaskCount and hasNextAction, excludes archived by default', () => {
    const sphere = makeSphere({ name: 'Work' })
    const active = makeProject(sphere, { name: 'Active' })
    const archived = makeProject(sphere, { name: 'Archived', isArchived: true })
    const task = makeTask({ projectId: active.id, isNext: true })
    const state = buildState({ spheres: [sphere], projects: [active, archived], tasks: [task] })

    const result = runQuery(state, { kind: 'projects' }) as { projects: { name: string; openTaskCount: number; hasNextAction: boolean }[] }
    expect(result.projects).toEqual([{ name: 'Active', openTaskCount: 1, hasNextAction: true }].map(p => expect.objectContaining(p)))
  })

  test('archived flag shows only archived, all shows both, sorted by name', () => {
    const sphere = makeSphere()
    const beta = makeProject(sphere, { name: 'Beta' })
    const alpha = makeProject(sphere, { name: 'Alpha', isArchived: true })
    const state = buildState({ spheres: [sphere], projects: [beta, alpha] })

    const archivedOnly = runQuery(state, { kind: 'projects', archived: true }) as { projects: { name: string }[] }
    expect(archivedOnly.projects.map(p => p.name)).toEqual(['Alpha'])

    const all = runQuery(state, { kind: 'projects', all: true }) as { projects: { name: string }[] }
    expect(all.projects.map(p => p.name)).toEqual(['Alpha', 'Beta'])
  })

  test('agenda filters to projects linked to that agenda', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere, { title: 'Jim' })
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const state = buildState({ spheres: [sphere], agendas: [agenda], projects: [linked, unlinked] })

    const result = runQuery(state, { kind: 'projects', agenda: 'Jim' }) as { projects: { name: string }[] }
    expect(result.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('unresolved agenda name throws', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'projects', agenda: 'Nope' })).toThrowError(/No agenda matching "Nope"/)
  })

  test('hasAgenda / withoutAgenda', () => {
    const sphere = makeSphere()
    const agenda = makeAgenda(sphere)
    const linked = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const unlinked = makeProject(sphere, { name: 'Solo' })
    const state = buildState({ spheres: [sphere], agendas: [agenda], projects: [linked, unlinked] })

    const withAgenda = runQuery(state, { kind: 'projects', hasAgenda: true }) as { projects: { name: string }[] }
    expect(withAgenda.projects.map(p => p.name)).toEqual(['Shared'])

    const withoutAgenda = runQuery(state, { kind: 'projects', withoutAgenda: true }) as { projects: { name: string }[] }
    expect(withoutAgenda.projects.map(p => p.name)).toEqual(['Solo'])
  })

  test('isSelfOnly filter', () => {
    const sphere = makeSphere()
    const selfOnly = makeProject(sphere, { name: 'Personal', isSelfOnly: true })
    const notSelfOnly = makeProject(sphere, { name: 'Other' })
    const state = buildState({ spheres: [sphere], projects: [selfOnly, notSelfOnly] })

    const filtered = runQuery(state, { kind: 'projects', isSelfOnly: true }) as { projects: { name: string }[] }
    expect(filtered.projects.map(p => p.name)).toEqual(['Personal'])

    const excluded = runQuery(state, { kind: 'projects', isSelfOnly: false }) as { projects: { name: string }[] }
    expect(excluded.projects.map(p => p.name)).toEqual(['Other'])
  })

  test('omits nextTasks by default', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Website' })
    const nextTask = makeTask({ projectId: project.id, isNext: true, title: 'Ship it' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [nextTask] })

    const result = runQuery(state, { kind: 'projects' }) as { projects: Record<string, unknown>[] }
    expect(result.projects[0]).not.toHaveProperty('nextTasks')
  })

  test('includeNextTasks includes each project\'s open next-action tasks, empty array when none', () => {
    const sphere = makeSphere()
    const withNext = makeProject(sphere, { name: 'Website' })
    const withoutNext = makeProject(sphere, { name: 'Empty' })
    const nextTask = makeTask({ projectId: withNext.id, isNext: true, title: 'Ship it' })
    const notNextTask = makeTask({ projectId: withNext.id, title: 'Someday' })
    const state = buildState({
      spheres: [sphere], projects: [withNext, withoutNext], tasks: [nextTask, notNextTask],
    })

    const result = runQuery(state, { kind: 'projects', includeNextTasks: true }) as {
      projects: { name: string; nextTasks: { title: string }[] }[]
    }
    const website = result.projects.find(p => p.name === 'Website')
    const empty = result.projects.find(p => p.name === 'Empty')
    expect(website?.nextTasks.map(t => t.title)).toEqual(['Ship it'])
    expect(empty?.nextTasks).toEqual([])
  })

  test('includeNextTasks includes every next task when a project has more than one', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Website' })
    const first = makeTask({ projectId: project.id, isNext: true, title: 'First next' })
    const second = makeTask({ projectId: project.id, isNext: true, title: 'Second next' })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [first, second] })

    const result = runQuery(state, { kind: 'projects', includeNextTasks: true }) as {
      projects: { nextTasks: { title: string }[] }[]
    }
    expect(result.projects[0]?.nextTasks.map(t => t.title).sort()).toEqual(['First next', 'Second next'])
  })

  test('includeNextTasks includes a next task that is waiting, with its waitingFor serialized', () => {
    const sphere = makeSphere()
    const project = makeProject(sphere, { name: 'Website' })
    const waitingNext = makeTask({
      projectId: project.id, isNext: true, title: 'Waiting next', waitingFor: { kind: 'review' },
    })
    const state = buildState({ spheres: [sphere], projects: [project], tasks: [waitingNext] })

    const result = runQuery(state, { kind: 'projects', includeNextTasks: true }) as {
      projects: { nextTasks: { title: string; waitingFor: unknown }[] }[]
    }
    expect(result.projects[0]?.nextTasks).toEqual([
      expect.objectContaining({ title: 'Waiting next', waitingFor: { kind: 'review' } }),
    ])
  })
})

describe('dashboard', () => {
  test('requires a sphere and includes due-today/overdue/starred tasks', () => {
    const sphere = makeSphere({ name: 'Work' })
    const overdue = makeTask({ sphereId: sphere.id, title: 'Overdue', dueDate: '2026-07-30' })
    const notDue = makeTask({ sphereId: sphere.id, title: 'NotDue', dueDate: '2026-08-10' })
    const state = buildState({ spheres: [sphere], tasks: [overdue, notDue] })

    const result = runQuery(state, { kind: 'dashboard', sphere: 'Work' }, { today: '2026-08-01' }) as { tasks: { title: string }[] }
    expect(result.tasks.map(t => t.title)).toEqual(['Overdue'])
  })

  test('unresolved sphere throws', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'dashboard', sphere: 'Nope' })).toThrowError(/No sphere matching "Nope"/)
  })

  test('limit truncates like tasks', () => {
    const sphere = makeSphere({ name: 'Work' })
    const tasks = [1, 2, 3].map(n => makeTask({ sphereId: sphere.id, title: `T${n}`, isStarred: true }))
    const state = buildState({ spheres: [sphere], tasks })
    const result = runQuery(state, { kind: 'dashboard', sphere: 'Work', limit: 2 }) as { count: number; total: number; truncated: boolean }
    expect(result).toMatchObject({ count: 2, total: 3, truncated: true })
  })
})

describe('processing', () => {
  test('has no sphere param and aggregates across all spheres', () => {
    const sphereA = makeSphere()
    const sphereB = makeSphere()
    const a = makeTask({ sphereId: sphereA.id, title: 'A', isNext: true })
    const b = makeTask({ sphereId: sphereB.id, title: 'B', isNext: true })
    const state = buildState({ spheres: [sphereA, sphereB], tasks: [a, b] })

    const result = runQuery(state, { kind: 'processing' }) as { actionableTasks: { title: string }[] }
    expect(result.actionableTasks.map(t => t.title).sort()).toEqual(['A', 'B'])
  })
})

describe('waiting', () => {
  test('groups by kind, sphere optional', () => {
    const sphere = makeSphere({ name: 'Work' })
    const reviewTask = makeTask({ sphereId: sphere.id, title: 'Review', waitingFor: { kind: 'review' } })
    const state = buildState({ spheres: [sphere], tasks: [reviewTask] })

    const result = runQuery(state, { kind: 'waiting', sphere: 'Work' }) as { groups: { kind: string; tasks: { title: string }[] }[] }
    expect(result.groups).toEqual([{ kind: 'review', tasks: [expect.objectContaining({ title: 'Review' })] }])
  })
})

describe('pick_list', () => {
  test('requires a sphere and groups by context', () => {
    const sphere = makeSphere({ name: 'Work' })
    const context = makeContext(sphere, { name: 'Email' })
    const task = makeTask({ sphereId: sphere.id, title: 'SendEmail', isNext: true, contextId: context.id })
    const state = buildState({ spheres: [sphere], contexts: [context], tasks: [task] })

    const result = runQuery(state, { kind: 'pick_list', sphere: 'Work' }) as { groups: { context: { name: string }; tasks: { title: string }[] }[] }
    expect(result.groups).toEqual([{ context: { id: context.id, name: 'Email' }, tasks: [expect.objectContaining({ title: 'SendEmail' })] }])
  })

  test('unresolved sphere throws', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'pick_list', sphere: 'Nope' })).toThrowError(/No sphere matching "Nope"/)
  })
})

describe('agenda_view', () => {
  test('returns the agenda, waiting/active tasks, and linked projects', () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const project = makeProject(sphere, { name: 'Shared', agendaId: agenda.id })
    const active = makeTask({ sphereId: sphere.id, title: 'Active', agendaId: agenda.id })
    const waiting = makeTask({ sphereId: sphere.id, title: 'Waiting', agendaId: agenda.id, waitingFor: { kind: 'review' } })
    const state = buildState({ spheres: [sphere], agendas: [agenda], projects: [project], tasks: [active, waiting] })

    const result = runQuery(state, { kind: 'agenda_view', agenda: 'Han' }) as {
      agenda: { name: string }
      activeTasks: { title: string }[]
      waitingTasks: { title: string }[]
      projects: { name: string }[]
    }
    expect(result.agenda.name).toBe('Han')
    expect(result.activeTasks.map(t => t.title)).toEqual(['Active'])
    expect(result.waitingTasks.map(t => t.title)).toEqual(['Waiting'])
    expect(result.projects.map(p => p.name)).toEqual(['Shared'])
  })

  test('unresolved agenda name throws', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'agenda_view', agenda: 'Nope' })).toThrowError(/No agenda matching "Nope"/)
  })

  test('sphere narrows an ambiguous agenda name', () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workAgenda = makeAgenda(work, { title: 'Sam' })
    const personalAgenda = makeAgenda(personal, { title: 'Sam' })
    const task = makeTask({ sphereId: personal.id, title: 'PersonalTask', agendaId: personalAgenda.id })
    const state = buildState({ spheres: [work, personal], agendas: [workAgenda, personalAgenda], tasks: [task] })

    const result = runQuery(state, { kind: 'agenda_view', agenda: 'Sam', sphere: 'Personal' }) as {
      agenda: { name: string }
      activeTasks: { title: string }[]
    }
    expect(result.agenda.name).toBe('Sam')
    expect(result.activeTasks.map(t => t.title)).toEqual(['PersonalTask'])
  })

  test('respects the due-date filter via today', () => {
    const sphere = makeSphere({ name: 'Work' })
    const agenda = makeAgenda(sphere, { title: 'Han' })
    const future = makeTask({ sphereId: sphere.id, title: 'Future', agendaId: agenda.id, dueDate: '2026-08-10' })
    const state = buildState({ spheres: [sphere], agendas: [agenda], tasks: [future] })

    const result = runQuery(state, { kind: 'agenda_view', agenda: 'Han' }, { today: '2026-08-01' }) as {
      activeTasks: { title: string }[]
    }
    expect(result.activeTasks).toEqual([])
  })
})

describe('spheres, agendas, contexts', () => {
  test('spheres sorted by name', () => {
    const state = buildState({ spheres: [makeSphere({ name: 'Work' }), makeSphere({ name: 'Personal' })] })
    const result = runQuery(state, { kind: 'spheres' }) as { spheres: { name: string }[] }
    expect(result.spheres.map(s => s.name)).toEqual(['Personal', 'Work'])
  })

  test('agendas scoped by sphere', () => {
    const work = makeSphere({ name: 'Work' })
    const personal = makeSphere({ name: 'Personal' })
    const workAgenda = makeAgenda(work, { title: 'Standup' })
    const personalAgenda = makeAgenda(personal, { title: 'Family' })
    const state = buildState({ spheres: [work, personal], agendas: [workAgenda, personalAgenda] })

    const result = runQuery(state, { kind: 'agendas', sphere: 'Work' }) as { agendas: { name: string }[] }
    expect(result.agendas.map(a => a.name)).toEqual(['Standup'])
  })

  test('contexts sorted by name', () => {
    const sphere = makeSphere()
    const state = buildState({ spheres: [sphere], contexts: [makeContext(sphere, { name: 'Phone' }), makeContext(sphere, { name: 'Email' })] })
    const result = runQuery(state, { kind: 'contexts' }) as { contexts: { name: string }[] }
    expect(result.contexts.map(c => c.name)).toEqual(['Email', 'Phone'])
  })
})

describe('search', () => {
  test('returns matching tasks and projects ranked by relevance', () => {
    const sphere = makeSphere()
    const task = makeTask({ sphereId: sphere.id, title: 'Buy milk' })
    const state = buildState({ spheres: [sphere], tasks: [task] })

    const result = runQuery(state, { kind: 'search', query: 'milk' }) as { results: { kind: string; task?: { title: string } }[] }
    expect(result.results.map(r => r.task?.title)).toEqual(['Buy milk'])
  })

  test('resolves sphere name to scope results', () => {
    const sphere = makeSphere({ name: 'Work' })
    const otherSphere = makeSphere({ name: 'Personal' })
    const inSphere = makeTask({ sphereId: sphere.id, title: 'Work milk task' })
    const outOfSphere = makeTask({ sphereId: otherSphere.id, title: 'Personal milk task' })
    const state = buildState({ spheres: [sphere, otherSphere], tasks: [inSphere, outOfSphere] })

    const result = runQuery(state, { kind: 'search', query: 'milk', sphere: 'Work' }) as { results: { task?: { title: string } }[] }
    expect(result.results.map(r => r.task?.title)).toEqual(['Work milk task'])
  })

  test('unresolved sphere throws', () => {
    const state = buildState({})
    expect(() => runQuery(state, { kind: 'search', query: 'milk', sphere: 'Nope' })).toThrowError(/No sphere matching "Nope"/)
  })

  test('limit truncates and reports total/truncated', () => {
    const tasks = ['Milk one', 'Milk two', 'Milk three'].map(title => makeTask({ title }))
    const state = buildState({ tasks })

    const result = runQuery(state, { kind: 'search', query: 'milk', limit: 2 }) as { count: number; total: number; truncated: boolean }
    expect(result).toMatchObject({ count: 2, total: 3, truncated: true })
  })

  test('blank query returns an empty result, not an error', () => {
    const state = buildState({ tasks: [makeTask({ title: 'Anything' })] })
    const result = runQuery(state, { kind: 'search', query: '' }) as { count: number; total: number; truncated: boolean; results: unknown[] }
    expect(result).toEqual({ count: 0, total: 0, truncated: false, results: [] })
  })
})
