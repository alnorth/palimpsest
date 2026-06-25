import { useState, useMemo, useCallback } from 'react'
import {
  listSpheres, listTasks, listProjects,
  createTask, updateTask, completeTask, uncompleteTask,
  createProject, updateProject, archiveProject, unarchiveProject,
  createSphere, createAgenda,
} from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { INITIAL_UI_STATE, INITIAL_NAV } from './types.js'
import type { UIState, Action, UIAction, DataAction } from './types.js'
import { uiReducer } from './reducer.js'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
import type { ViewModel } from './viewModel.js'
import type { Command } from './types.js'

export interface AppStateResult extends ViewModel {
  projState: ProjectionState
  uiState: UIState
  commands: Command[]
  dispatch: (action: Action) => void
}

function isDataAction(action: Action): action is DataAction {
  return (
    action.type === 'create-task' ||
    action.type === 'edit-task' ||
    action.type === 'edit-task-description' ||
    action.type === 'complete-task' ||
    action.type === 'uncomplete-task' ||
    action.type === 'toggle-next' ||
    action.type === 'toggle-starred' ||
    action.type === 'set-task-agenda' ||
    action.type === 'create-project' ||
    action.type === 'edit-project' ||
    action.type === 'archive-project' ||
    action.type === 'unarchive-project' ||
    action.type === 'create-sphere' ||
    action.type === 'create-agenda'
  )
}

export function useAppState(store: PalimpsestStore): AppStateResult {
  const [projState, setProjState] = useState<ProjectionState>(() => store.getState())
  const [uiState, setUIState] = useState<UIState>(() => ({
    ...INITIAL_UI_STATE,
    currentSphereId: store.getState().spheres.values().next().value?.id,
  }))

  function refreshProj(): ProjectionState {
    const next = store.getState()
    setProjState(next)
    return next
  }

  const vm = useMemo(() => deriveViewModel(projState, uiState), [projState, uiState])
  const commands = useMemo(() => getCommands(vm), [vm])

  const dispatch = useCallback((action: Action) => {
    if (!isDataAction(action)) {
      setUIState(prev => uiReducer(prev, action as UIAction))
      return
    }

    switch (action.type) {
      case 'create-task': {
        const sphereId = action.sphereId ?? vm.activeSphere?.id
        const projectId = action.projectId
        if (projectId !== undefined) {
          store.appendEvents(createTask(projState, { title: action.title, projectId }))
          const next = refreshProj()
          const newTasks = listTasks(next, { projectId, status: 'open' })
          setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: newTasks.length - 1 } }))
        } else if (sphereId !== undefined) {
          store.appendEvents(createTask(projState, { title: action.title, sphereId }))
          const next = refreshProj()
          const newTasks = listTasks(next, { sphereId, status: 'open' })
          setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: newTasks.length - 1 } }))
        }
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'edit-task': {
        store.appendEvents(updateTask(projState, { taskId: action.taskId, patch: { title: action.title } }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'edit-task-description': {
        store.appendEvents(updateTask(projState, { taskId: action.taskId, patch: { description: action.description } }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'complete-task': {
        store.appendEvents(completeTask(projState, action.taskId))
        const next = refreshProj()
        if (vm.view !== 'task') {
          const activeProjectId = vm.activeProject?.id
          const activeSphereId = vm.activeSphere?.id
          const remainingTasks = activeProjectId !== undefined
            ? listTasks(next, { projectId: activeProjectId, status: 'open' })
            : activeSphereId !== undefined
              ? listTasks(next, { sphereId: activeSphereId, status: 'open' })
              : []
          setUIState(prev => uiReducer(prev, {
            type: 'update-nav',
            patch: { selected: Math.max(0, Math.min(prev.navStack[prev.navStack.length - 1]?.selected ?? 0, remainingTasks.length - 1)) },
          }))
        }
        break
      }

      case 'uncomplete-task': {
        store.appendEvents(uncompleteTask(projState, action.taskId))
        const next = refreshProj()
        if (vm.view !== 'task') {
          const activeProjectId = vm.activeProject?.id
          const activeSphereId = vm.activeSphere?.id
          const remainingTasks = activeProjectId !== undefined
            ? listTasks(next, { projectId: activeProjectId, status: 'completed' })
            : activeSphereId !== undefined
              ? listTasks(next, { sphereId: activeSphereId, status: 'completed' })
              : []
          setUIState(prev => uiReducer(prev, {
            type: 'update-nav',
            patch: { selected: Math.max(0, Math.min(prev.navStack[prev.navStack.length - 1]?.selected ?? 0, remainingTasks.length - 1)) },
          }))
        }
        break
      }

      case 'toggle-next': {
        const task = projState.tasks.get(action.taskId)
        if (task !== undefined) {
          store.appendEvents(updateTask(projState, { taskId: action.taskId, patch: { isNext: task.isNext !== true } }))
          refreshProj()
        }
        break
      }

      case 'toggle-starred': {
        const task = projState.tasks.get(action.taskId)
        if (task !== undefined) {
          store.appendEvents(updateTask(projState, { taskId: action.taskId, patch: { isStarred: task.isStarred !== true } }))
          refreshProj()
        }
        break
      }

      case 'set-task-agenda': {
        store.appendEvents(updateTask(projState, { taskId: action.taskId, patch: { agendaId: action.agendaId } }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'create-project': {
        store.appendEvents(createProject(projState, { name: action.name, sphereId: action.sphereId }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'edit-project': {
        store.appendEvents(updateProject(projState, action.projectId, { name: action.name }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
        break
      }

      case 'archive-project': {
        store.appendEvents(archiveProject(projState, action.projectId))
        const next = refreshProj()
        const activeSphereId = vm.activeSphere?.id
        const remaining = activeSphereId !== undefined
          ? listProjects(next, { sphereId: activeSphereId, isArchived: false })
          : []
        setUIState(prev => uiReducer(prev, {
          type: 'update-nav',
          patch: { selected: Math.max(0, Math.min(prev.navStack[prev.navStack.length - 1]?.selected ?? 0, remaining.length - 1)) },
        }))
        break
      }

      case 'unarchive-project': {
        store.appendEvents(unarchiveProject(projState, action.projectId))
        const next = refreshProj()
        const activeSphereId = vm.activeSphere?.id
        const remaining = activeSphereId !== undefined
          ? listProjects(next, { sphereId: activeSphereId, isArchived: true })
          : []
        setUIState(prev => uiReducer(prev, {
          type: 'update-nav',
          patch: { selected: Math.max(0, Math.min(prev.navStack[prev.navStack.length - 1]?.selected ?? 0, remaining.length - 1)) },
        }))
        break
      }

      case 'create-sphere': {
        store.appendEvents(createSphere(projState, { name: action.name }))
        const next = refreshProj()
        setUIState(prev => ({
          ...uiReducer(prev, { type: 'set-mode', mode: 'settings' }),
          currentSphereId: prev.currentSphereId ?? listSpheres(next)[0]?.id,
        }))
        break
      }

      case 'create-agenda': {
        store.appendEvents(createAgenda(projState, { title: action.title, sphereId: action.sphereId }))
        refreshProj()
        setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'settings' }))
        break
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, uiState, vm])

  return { ...vm, projState, uiState, commands, dispatch }
}
