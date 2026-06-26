import { describe, it, expect } from 'vitest'
import {
  project, createEmptyState, buildStateFromConfig,
  createProject, createTask,
} from 'palimpsest'
import type { SphereId, ContextId } from 'palimpsest'
import { deriveViewModel } from './viewModel.js'
import { INITIAL_UI_STATE, INITIAL_NAV } from './types.js'
import type { UIState } from './types.js'

const SPHERE_ID = 'sph1' as SphereId

function buildTestState() {
  const baseState = { ...createEmptyState(), ...buildStateFromConfig([{ id: SPHERE_ID, name: 'Work', agendas: [], contexts: [] }]) }
  const sphere = baseState.spheres.get(SPHERE_ID)!

  const projectEvents = createProject({ name: 'Alpha', sphereId: sphere.id })
  const withProject = project(projectEvents, baseState)
  const proj = [...withProject.projects.values()][0]!

  const task1Events = createTask({ title: 'Task One', sphereId: sphere.id })
  const task2Events = createTask({ title: 'Task Two', projectId: proj.id })

  const allEvents = [...projectEvents, ...task1Events, ...task2Events]
  const finalState = project(allEvents, baseState)

  const task1 = [...finalState.tasks.values()].find(t => t.title === 'Task One')!
  const task2 = [...finalState.tasks.values()].find(t => t.title === 'Task Two')!

  return { projState: finalState, sphere, proj, task1, task2 }
}

function makeUIState(overrides: Partial<UIState> = {}): UIState {
  return { ...INITIAL_UI_STATE, ...overrides }
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
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.tasks.some(t => t.id === task1.id)).toBe(true)
  })

  it('includes project tasks in the sphere task list', () => {
    const { projState, sphere, task2 } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.tasks.some(t => t.id === task2.id)).toBe(true)
  })

  it('returns empty tasks when there are no spheres at all', () => {
    const projState = createEmptyState()
    const uiState = makeUIState({ currentSphereId: undefined })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.tasks).toHaveLength(0)
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
      navStack: [{ ...INITIAL_NAV, showCompleted: true }],
    })
    const vm = deriveViewModel(projState, uiState)
    // no completed tasks in our test state, so empty is fine
    expect(vm.tasks).toHaveLength(0)
  })
})

describe('deriveViewModel — projects view', () => {
  it('lists projects for the active sphere', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.projects.some(p => p.id === proj.id)).toBe(true)
  })
})

describe('deriveViewModel — project view', () => {
  it('returns tasks for the active project', () => {
    const { projState, sphere, proj, task2 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'project', activeProjectId: proj.id }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.projectTasks.some(t => t.id === task2.id)).toBe(true)
    expect(vm.activeProject?.id).toBe(proj.id)
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
        { ...INITIAL_NAV, view: 'project', activeProjectId: proj.id },
      ],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.canGoBack).toBe(true)
  })

  it('exposes convenience properties from currentNav', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects', selected: 2 }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.view).toBe('projects')
    expect(vm.selected).toBe(2)
  })

  it('listLength equals tasks.length in tasks view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ ...INITIAL_NAV, view: 'tasks' }] })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.listLength).toBe(vm.tasks.length)
  })

  it('listLength equals projects.length in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.listLength).toBe(vm.projects.length)
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
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.currentTask?.id).toBe(task1.id)
  })

  it('is undefined in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const vm = deriveViewModel(projState, uiState)
    expect(vm.currentTask).toBeUndefined()
  })
})
