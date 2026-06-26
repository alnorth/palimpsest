import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  listTasks, listProjects,
  createTask, updateTask, completeTask, uncompleteTask,
  createProject, updateProject, archiveProject, unarchiveProject,
  createEmptyState, project,
  CLEAR,
} from 'palimpsest'
import type { PalimpsestStore, ProjectionState, ProjectCreatedEvent } from 'palimpsest'
import { INITIAL_UI_STATE } from './types.js'
import type { UIState, Action, UIAction, DataAction } from './types.js'
import { uiReducer } from './reducer.js'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
import type { ViewModel } from './viewModel.js'
import type { Command } from './types.js'
import type { SyncHealth, PendingConflict } from './ClientPalimpsestStore.js'
import { indexAfterAppend, indexAfterRemove } from './navHelpers.js'

export interface AppStateResult extends ViewModel {
  projState: ProjectionState
  uiState: UIState
  commands: Command[]
  dispatch: (action: Action) => void
  isLoading: boolean
  syncHealth: SyncHealth
  unsyncedCount: number
  pendingConflicts: PendingConflict[]
  lastSyncError: string | undefined
}

function isDataAction(action: Action): action is DataAction {
  return (
    action.type === 'create-task' ||
    action.type === 'edit-task' ||
    action.type === 'edit-task-description' ||
    action.type === 'set-task-due-date' ||
    action.type === 'set-task-due-date-expression' ||
    action.type === 'complete-task' ||
    action.type === 'uncomplete-task' ||
    action.type === 'toggle-next' ||
    action.type === 'toggle-starred' ||
    action.type === 'set-task-project' ||
    action.type === 'set-task-agenda' ||
    action.type === 'create-project' ||
    action.type === 'create-and-assign-project' ||
    action.type === 'edit-project' ||
    action.type === 'archive-project' ||
    action.type === 'unarchive-project'
  )
}

interface HasSyncHealth {
  readonly syncHealth: SyncHealth
  readonly unsyncedCount: number
  readonly pendingConflicts: PendingConflict[]
  readonly lastSyncError: string | undefined
}

function hasSyncHealth(store: PalimpsestStore): store is PalimpsestStore & HasSyncHealth {
  return 'syncHealth' in store
}

export function useAppState(store: PalimpsestStore): AppStateResult {
  const [projState, setProjState] = useState<ProjectionState | undefined>(undefined)
  const [uiState, setUIState] = useState<UIState>(INITIAL_UI_STATE)
  const [syncHealth, setSyncHealth] = useState<SyncHealth>('idle')
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [pendingConflicts, setPendingConflicts] = useState<PendingConflict[]>([])
  const [lastSyncError, setLastSyncError] = useState<string | undefined>(undefined)

  const applyState = useCallback((state: ProjectionState) => {
    setProjState(state)
    setUIState(prev => ({
      ...prev,
      currentSphereId: prev.currentSphereId ?? state.spheres.values().next().value?.id,
    }))
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubFn: (() => void) | undefined

    void store.init().then(async () => {
      if (cancelled) return
      applyState(await store.getState())
      if (cancelled) return

      unsubFn = store.subscribe(() => {
        void store.getState().then(applyState)
        if (hasSyncHealth(store)) {
          setSyncHealth(store.syncHealth)
          setUnsyncedCount(store.unsyncedCount)
          setPendingConflicts(store.pendingConflicts)
          setLastSyncError(store.lastSyncError)
        }
      })
      store.start()
    })

    return () => {
      cancelled = true
      unsubFn?.()
      store.stop()
    }
  }, [store, applyState])

  const resolvedState = projState ?? createEmptyState()
  const vm = useMemo(() => deriveViewModel(resolvedState, uiState), [resolvedState, uiState])
  const commands = useMemo(() => getCommands(vm), [vm])
  const isLoading = projState === undefined

  const dispatch = useCallback((action: Action) => {
    if (!isDataAction(action)) {
      setUIState(prev => uiReducer(prev, action as UIAction))
      return
    }

    void (async () => {
      switch (action.type) {
        case 'create-task': {
          const sphereId = action.sphereId ?? vm.activeSphere?.id
          const projectId = action.projectId
          if (projectId !== undefined) {
            const tasks = listTasks(resolvedState, { projectId, status: 'open' })
            await store.appendEvents(createTask(resolvedState, { title: action.title, projectId }))
            setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: indexAfterAppend(tasks) } }))
          } else if (sphereId !== undefined) {
            const tasks = listTasks(resolvedState, { sphereId, status: 'open' })
            await store.appendEvents(createTask(resolvedState, { title: action.title, sphereId }))
            setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: indexAfterAppend(tasks) } }))
          }
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-task': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { title: action.title } }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-task-description': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { description: action.description } }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-due-date': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { dueDate: action.dueDate } }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-due-date-expression': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { dueDateExpression: action.dueDateExpression } }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'complete-task': {
          if (vm.view !== 'task') {
            const activeProjectId = vm.activeProject?.id
            const activeSphereId = vm.activeSphere?.id
            const tasks = activeProjectId !== undefined
              ? listTasks(resolvedState, { projectId: activeProjectId, status: 'open' })
              : activeSphereId !== undefined
                ? listTasks(resolvedState, { sphereId: activeSphereId, status: 'open' })
                : []
            await store.appendEvents(completeTask(resolvedState, action.taskId))
            setUIState(prev => uiReducer(prev, {
              type: 'update-nav',
              patch: { selected: indexAfterRemove(tasks, prev.navStack[prev.navStack.length - 1]?.selected ?? 0) },
            }))
          } else {
            await store.appendEvents(completeTask(resolvedState, action.taskId))
          }
          break
        }

        case 'uncomplete-task': {
          if (vm.view !== 'task') {
            const activeProjectId = vm.activeProject?.id
            const activeSphereId = vm.activeSphere?.id
            const tasks = activeProjectId !== undefined
              ? listTasks(resolvedState, { projectId: activeProjectId, status: 'completed' })
              : activeSphereId !== undefined
                ? listTasks(resolvedState, { sphereId: activeSphereId, status: 'completed' })
                : []
            await store.appendEvents(uncompleteTask(resolvedState, action.taskId))
            setUIState(prev => uiReducer(prev, {
              type: 'update-nav',
              patch: { selected: indexAfterRemove(tasks, prev.navStack[prev.navStack.length - 1]?.selected ?? 0) },
            }))
          } else {
            await store.appendEvents(uncompleteTask(resolvedState, action.taskId))
          }
          break
        }

        case 'toggle-next': {
          const task = resolvedState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { isNext: task.isNext !== true } }))
          }
          break
        }

        case 'toggle-starred': {
          const task = resolvedState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { isStarred: task.isStarred !== true } }))
          }
          break
        }

        case 'set-task-project': {
          const task = resolvedState.tasks.get(action.taskId)
          if (task === undefined) break
          if (action.projectId === CLEAR) {
            const sphereId =
              task.sphereId ??
              (task.projectId !== undefined ? resolvedState.projects.get(task.projectId)?.sphereId : undefined) ??
              vm.activeSphere?.id
            if (sphereId === undefined) break
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { projectId: CLEAR, sphereId } }))
          } else {
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { projectId: action.projectId, sphereId: CLEAR } }))
          }
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-agenda': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { agendaId: action.agendaId } }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'create-project': {
          await store.appendEvents(createProject(resolvedState, { name: action.name, sphereId: action.sphereId }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'create-and-assign-project': {
          const createEvts = createProject(resolvedState, { name: action.name, sphereId: action.sphereId })
          const projectId = (createEvts[0] as ProjectCreatedEvent).projectId
          const stateWithProject = project(createEvts, resolvedState)
          const assignEvts = updateTask(stateWithProject, { taskId: action.taskId, patch: { projectId, sphereId: CLEAR } })
          await store.appendEvents([...createEvts, ...assignEvts])
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-project': {
          await store.appendEvents(updateProject(resolvedState, action.projectId, { name: action.name }))
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'archive-project': {
          const activeSphereId = vm.activeSphere?.id
          const projects = activeSphereId !== undefined
            ? listProjects(resolvedState, { sphereId: activeSphereId, isArchived: false })
            : []
          await store.appendEvents(archiveProject(resolvedState, action.projectId))
          setUIState(prev => uiReducer(prev, {
            type: 'update-nav',
            patch: { selected: indexAfterRemove(projects, prev.navStack[prev.navStack.length - 1]?.selected ?? 0) },
          }))
          break
        }

        case 'unarchive-project': {
          const activeSphereId = vm.activeSphere?.id
          const projects = activeSphereId !== undefined
            ? listProjects(resolvedState, { sphereId: activeSphereId, isArchived: true })
            : []
          await store.appendEvents(unarchiveProject(resolvedState, action.projectId))
          setUIState(prev => uiReducer(prev, {
            type: 'update-nav',
            patch: { selected: indexAfterRemove(projects, prev.navStack[prev.navStack.length - 1]?.selected ?? 0) },
          }))
          break
        }

      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedState, uiState, vm])

  return { ...vm, projState: resolvedState, uiState, commands, dispatch, isLoading, syncHealth, unsyncedCount, pendingConflicts, lastSyncError }
}
