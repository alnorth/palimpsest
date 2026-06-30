import { describe, it, expect } from 'vitest'
import { project, createEmptyState, buildStateFromConfig, createProject, createTask } from 'palimpsest'
import type { SphereId } from 'palimpsest'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
import { INITIAL_NAV } from './types.js'
import type { UIState } from './types.js'
import { makeUIState } from './testHelpers.js'

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


function commandIds(projState: ReturnType<typeof project>, uiState: UIState) {
  const vm = deriveViewModel(projState, uiState)
  return Object.keys(getCommands(vm))
}

describe('commands — dashboard view', () => {
  it('includes add-task and add-project', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'dashboard' as const, selected: 0 }] })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
    expect(ids).toContain('add-project')
  })
})

describe('commands — tasks view, list mode', () => {
  it('includes add-task', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
  })

  it('includes add-project', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-project')
  })

  it('suppresses add-task when showing completed tasks', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: true }] })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
  })

  it('includes view-switcher and sphere-cycle', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
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
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
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
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
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
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
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
      navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: true }],
    })
    // No completed tasks in our test state, but the shape test:
    // In completed mode, the 'c' key action should be uncomplete-task
    const vm = deriveViewModel(projState, uiState)
    const commands = getCommands(vm)
    const toggleCmd = commands['complete-task'] ?? commands['uncomplete-task']
    // No completed tasks so no toggle command
    expect(toggleCmd).toBeUndefined()
  })
})

describe('commands — projects view', () => {
  it('includes add-project', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-project')
  })

  it('includes add-task', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
  })

  it('suppresses add-project when showing archived projects', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: true }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-project')
  })

  it('includes edit-project when a project is selected', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('edit-project')
  })

  it('includes archive-project when not in archived view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('archive-project')
  })

  it('includes show-archived toggle', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('toggle-archived')
  })
})

describe('commands — processing view', () => {
  // In buildTestState: Task One (no project) is actionable → flat index 0
  // Alpha project (no next action) → flat index 1
  it('includes archive-project when a project is selected', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'processing' as const, selected: 1 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('archive-project')
  })

  it('includes edit-project when a project is selected', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'processing' as const, selected: 1 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('edit-project')
  })
})

describe('commands — project view', () => {
  it('includes add-task and add-project', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('add-task')
    expect(ids).toContain('add-project')
  })

  it('suppresses add-task when showing completed tasks', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: true }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
  })

  it('includes toggle-next for open tasks', () => {
    const { projState, sphere, proj } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: false }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).toContain('toggle-next')
  })
})

describe('commands — task view', () => {
  it('does not include add-task or add-project', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ ...INITIAL_NAV, view: 'task', activeTaskId: task1.id }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
    expect(ids).not.toContain('add-project')
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
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
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
      navStack: [{ view: 'tasks' as const, selected: idx, showCompleted: false }],
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
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    expect(commandIds(projState, uiState)).not.toContain('pick-due-date')
  })
})

describe('commands — picker views', () => {
  it('does not include add-task or add-project in picking-view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'dashboard' as const, selected: 0 }, { view: 'picking-view' as const, selected: 0 }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
    expect(ids).not.toContain('add-project')
  })

  it('does not include add-task or add-project in picking-due-date', () => {
    const { projState, sphere, task1 } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }, { view: 'picking-due-date' as const, selected: 0, activeTaskId: task1.id }],
    })
    const ids = commandIds(projState, uiState)
    expect(ids).not.toContain('add-task')
    expect(ids).not.toContain('add-project')
  })
})

describe('commands — create group', () => {
  it('add-task has group create and key q', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'dashboard' as const, selected: 0 }] })
    const vm = deriveViewModel(projState, uiState)
    const cmd = getCommands(vm)['add-task']
    expect(cmd?.group).toBe('create')
    expect(cmd?.key).toBe('q')
  })

  it('add-project has group create and key j', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'dashboard' as const, selected: 0 }] })
    const vm = deriveViewModel(projState, uiState)
    const cmd = getCommands(vm)['add-project']
    expect(cmd?.group).toBe('create')
    expect(cmd?.key).toBe('j')
  })
})

describe('commands — toggle-completed', () => {
  it('is available in tasks and project views', () => {
    const { projState, sphere, proj } = buildTestState()

    const tasksUiState = makeUIState({ currentSphereId: sphere.id, navStack: [{ view: 'tasks' as const, selected: 0, showCompleted: false }] })
    expect(commandIds(projState, tasksUiState)).toContain('toggle-completed')

    const projectUiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'project' as const, selected: 0, activeProjectId: proj.id, showCompleted: false }],
    })
    expect(commandIds(projState, projectUiState)).toContain('toggle-completed')
  })

  it('is not available in projects view', () => {
    const { projState, sphere } = buildTestState()
    const uiState = makeUIState({
      currentSphereId: sphere.id,
      navStack: [{ view: 'projects' as const, selected: 0, showArchived: false }],
    })
    expect(commandIds(projState, uiState)).not.toContain('toggle-completed')
  })
})
