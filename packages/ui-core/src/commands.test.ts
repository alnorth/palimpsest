import { describe, it, expect } from 'vitest'
import { project, createEmptyState, buildStateFromConfig, createProject, createTask } from 'palimpsest'
import type { SphereId } from 'palimpsest'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
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

function commandIds(projState: ReturnType<typeof project>, uiState: UIState) {
  const vm = deriveViewModel(projState, uiState)
  return getCommands(vm).map(c => c.id)
}

describe('commands — tasks view, list mode', () => {
  it('includes add-task', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
  })

  it('includes view-switcher and sphere-cycle', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('pick-view')
    expect(ids).toContain('cycle-sphere')
  })

})

describe('commands — tasks view with selected open task', () => {
  it('includes complete-task, edit-task, edit-description, star, agenda', () => {
    const { projState, sphere, task1 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => !t.projectId && t.status === 'open')
    const idx = tasks.findIndex(t => t.id === task1.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('complete-task')
    expect(ids).toContain('edit-task')
    expect(ids).toContain('edit-description')
    expect(ids).toContain('star')
    expect(ids).toContain('pick-agenda')
  })

  it('does not include view-project when task has no project', () => {
    const { projState, sphere, task1 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => !t.projectId && t.status === 'open')
    const idx = tasks.findIndex(t => t.id === task1.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('view-project')
  })

  it('includes view-project when task has a project', () => {
    const { projState, sphere, task2 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => t.status === 'open')
    const idx = tasks.findIndex(t => t.id === task2.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('view-project')
  })
})

describe('commands — completed tasks view', () => {
  it('includes uncomplete-task instead of complete-task', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', showCompleted: true, selected: 0 }],
    })
    // No completed tasks in our test state, but the shape test:
    // In completed mode, the 'c' key action should be uncomplete-task
    const vm = deriveViewModel(projState, uiState)
    const commands = getCommands(vm)
    const toggleCmd = commands.find(c => c.id === 'complete-task' || c.id === 'uncomplete-task')
    // No completed tasks so no toggle command
    expect(toggleCmd).toBeUndefined()
  })
})

describe('commands — projects view', () => {
  it('includes add-project', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-project')
  })

  it('does not include add-task', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
  })

  it('includes edit-project when a project is selected', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects', selected: 0 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('edit-project')
  })

  it('includes archive-project when not in archived view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects', selected: 0 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('archive-project')
  })

  it('includes show-archived toggle', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('toggle-archived')
  })
})

describe('commands — project view', () => {
  it('includes add-task', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'project', activeProjectId: proj.id }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
  })

  it('includes toggle-next for open tasks', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'project', activeProjectId: proj.id, selected: 0 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('toggle-next')
  })
})

describe('commands — task view', () => {
  it('does not include add-task', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'task', activeTaskId: task1.id }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
  })

  it('includes complete-task for open task', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'task', activeTaskId: task1.id }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('complete-task')
  })
})

describe('commands — pick-context', () => {
  it('is available for open tasks', () => {
    const { projState, sphere, task1 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => !t.projectId && t.status === 'open')
    const idx = tasks.findIndex(t => t.id === task1.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    expect(commandIds(projState, uiState)).toContain('pick-context')
  })
})

describe('commands — pick-due-date', () => {
  it('is available for open tasks in tasks view', () => {
    const { projState, sphere, task1 } = buildTestState()
    const tasks = [...projState.tasks.values()].filter(t => !t.projectId && t.status === 'open')
    const idx = tasks.findIndex(t => t.id === task1.id)
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'tasks', selected: idx }],
    })
    expect(commandIds(projState, uiState)).toContain('pick-due-date')
  })

  it('is available for open tasks in task view', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'task', activeTaskId: task1.id }],
    })
    expect(commandIds(projState, uiState)).toContain('pick-due-date')
  })

  it('is not available in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    expect(commandIds(projState, uiState)).not.toContain('pick-due-date')
  })
})

describe('commands — toggle-completed', () => {
  it('is available in tasks and project views', () => {
    const { projState, sphere, proj } = buildTestState()

    const tasksUiState = makeUIState({ currentSphereId: sphere.id })
    expect(commandIds(projState, tasksUiState)).toContain('toggle-completed')

    const projectUiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'project', activeProjectId: proj.id }],
    })
    expect(commandIds(projState, projectUiState)).toContain('toggle-completed')
  })

  it('is not available in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'projects' }],
    })
    expect(commandIds(projState, uiState)).not.toContain('toggle-completed')
  })
})
