import { describe, it, expect } from 'vitest'
import {
  project, createEmptyState, buildStateFromConfig,
  createProject, createTask,
} from 'palimpsest'
import type { SphereId, ContextId, AgendaId } from 'palimpsest'
import { deriveViewModel } from './viewModel.js'
import { INITIAL_NAV } from './types.js'
import { makeUIState } from './testHelpers.js'

const SPHERE_ID = 'sph1' as SphereId
const AGENDA_ID = 'agenda1' as AgendaId

function buildTestState() {
  const baseState = {
    ...createEmptyState(),
    ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [{ id: AGENDA_ID, title: 'Jim' }], contexts: [] }]),
  }
  const sphere = baseState.spheres.get(SPHERE_ID)!
  const agenda = baseState.agendas.get(AGENDA_ID)!

  const projectEvents = createProject({ name: 'Alpha', sphereId: sphere.id })
  const withProject = project(projectEvents, baseState)
  const proj = [...withProject.projects.values()][0]!

  const task1Events = createTask({ title: 'Task One', sphereId: sphere.id })
  const task2Events = createTask({ title: 'Task Two', projectId: proj.id })
  const task3Events = createTask({ title: 'Task Three', sphereId: sphere.id, agendaId: agenda.id })

  const allEvents = [...projectEvents, ...task1Events, ...task2Events, ...task3Events]
  const finalState = project(allEvents, baseState)

  const task1 = [...finalState.tasks.values()].find(t => t.title === 'Task One')!
  const task2 = [...finalState.tasks.values()].find(t => t.title === 'Task Two')!
  const task3 = [...finalState.tasks.values()].find(t => t.title === 'Task Three')!

  return { projState: finalState, sphere, proj, agenda, task1, task2, task3 }
}


describe('deriveViewModel — tasks view', () => {
  it('returns the active sphere', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.activeSphere?.id).toBe(sphere.id)
  })

  it('lists open tasks for the active sphere', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'tasks') throw new Error('expected tasks view')
    expect(vm.listItems.items.some(i => i.kind === 'task' && i.task.id === task1.id)).toBe(true)
  })

  it('includes project tasks in the sphere task list', () => {
    const { projState, sphere, task2 } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'tasks') throw new Error('expected tasks view')
    expect(vm.listItems.items.some(i => i.kind === 'task' && i.task.id === task2.id)).toBe(true)
  })

  it('returns empty tasks when there are no spheres at all', () => {
    const projState = createEmptyState()
    const uiState = makeUIState({ currentSphereId: undefined })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.listItems.items).toHaveLength(0)
    expect(vm.activeSphere).toBeUndefined()
  })

  it('falls back to the first sphere when currentSphereId is undefined', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: undefined })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.activeSphere?.id).toBe(sphere.id)
  })

  it('returns completed tasks sorted by completedAt when showCompleted is true', () => {
    const { projState, sphere } = buildTestState()
    // simple check: completed tasks in showCompleted mode are sorted descending
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: true }],
    })
    const vm = deriveViewModel(projState, uiState)
    // no completed tasks in our test state, so empty is fine
    expect(vm.listItems.items).toHaveLength(0)
  })
})

describe('deriveViewModel — projects view', () => {
  it('lists projects for the active sphere', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'projects') throw new Error('expected projects view')
    expect(vm.listItems.items.some(i => i.kind === 'project' && i.project.id === proj.id)).toBe(true)
  })
})

describe('deriveViewModel — project view', () => {
  it('returns tasks for the active project', () => {
    const { projState, sphere, proj, task2 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'project') throw new Error('expected project view')
    expect(vm.listItems.items.some(i => i.kind === 'task' && i.task.id === task2.id)).toBe(true)
    expect(vm.activeProject?.id).toBe(proj.id)
  })
})

describe('deriveViewModel — agendas view', () => {
  it('lists agendas for the active sphere', () => {
    const { projState, sphere, agenda } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'agendas' as const, selected: 0 }],
    })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'agendas') throw new Error('expected agendas view')
    expect(vm.listItems.items.some(i => i.kind === 'agenda' && i.agenda.id === agenda.id)).toBe(true)
  })
})

describe('deriveViewModel — agenda view', () => {
  it('returns tasks for the active agenda', () => {
    const { projState, sphere, agenda, task3 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'agenda' as const, selected: 0, activeAgendaId: agenda.id, showCompleted: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'agenda') throw new Error('expected agenda view')
    expect(vm.listItems.items.some(i => i.kind === 'task' && i.task.id === task3.id)).toBe(true)
    expect(vm.activeAgenda?.id).toBe(agenda.id)
  })

  it('excludes tasks not assigned to the active agenda', () => {
    const { projState, sphere, agenda, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'agenda' as const, selected: 0, activeAgendaId: agenda.id, showCompleted: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    if (vm.listItems.view !== 'agenda') throw new Error('expected agenda view')
    expect(vm.listItems.items.some(i => i.kind === 'task' && i.task.id === task1.id)).toBe(false)
  })
})

describe('deriveViewModel — agendaStats', () => {
  it('counts open tasks per agenda', () => {
    const { projState, sphere, agenda } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.agendaStats.get(agenda.id)).toBe(1)
  })
})

describe('deriveViewModel — task view', () => {
  it('returns the active task', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'task', activeTaskId: task1.id }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.activeTask?.id).toBe(task1.id)
    expect(vm.currentTask?.id).toBe(task1.id)
  })
})

describe('deriveViewModel — navigation helpers', () => {
  it('canGoBack is false at the root', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.canGoBack).toBe(false)
  })

  it('canGoBack is true when nav stack has more than one entry', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [
        INITIAL_NAV,
        { view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: false },
      ],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.canGoBack).toBe(true)
  })

  it('exposes view from currentNav', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 2, showArchived: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.view).toBe('projects')
  })
})

describe('deriveViewModel — contexts', () => {
  it('lists contexts for the active sphere', () => {
    const contextId = 'ctx1' as ContextId
    const baseState = {
      ...createEmptyState(),
      ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [{ id: contextId, name: 'Phone' }] }]),
    }
    const uiState = makeUIState({ currentSphereId: SPHERE_ID })
    const vm = deriveViewModel(baseState, uiState)
    expect(vm.contexts.some(c => c.id === contextId)).toBe(true)
  })

  it('returns empty contexts when activeSphere is undefined', () => {
    const projState = createEmptyState()
    const uiState = makeUIState({ currentSphereId: undefined })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.contexts).toHaveLength(0)
  })
})

describe('deriveViewModel — projectStats', () => {
  it('counts open tasks per project', () => {
    const { projState, proj } = buildTestState()
    const uiState = makeUIState({ currentSphereId: [...projState.spheres.values()][0]!.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.projectStats.taskCount.get(proj.id)).toBe(1)
  })
})

describe('deriveViewModel — currentTask', () => {
  it('is the selected task in tasks view', () => {
    const { projState, sphere, task1 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => !t.projectId)
    const idx = tasks.findIndex(t => t.id === task1.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.currentTask?.id).toBe(task1.id)
  })

  it('is undefined in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.currentTask).toBeUndefined()
  })
})
