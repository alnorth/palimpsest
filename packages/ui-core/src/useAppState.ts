import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  listSpheres, listTasks, listProjects,
  createTask, updateTask, completeTask, uncompleteTask,
  createProject, updateProject, archiveProject, unarchiveProject,
  createSphere, createAgenda,
  createEmptyState,
  CLEAR,
} from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { INITIAL_UI_STATE } from './types.js'
import type { UIState, Action, UIAction, DataAction } from './types.js'
import { uiReducer } from './reducer.js'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
import type { ViewModel } from './viewModel.js'
import type { Command } from './types.js'
import type { SyncHealth, PendingConflict } from './ClientPalimpsestStore.js'

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
    action.type === 'edit-project' ||
    action.type === 'archive-project' ||
    action.type === 'unarchive-project' ||
    action.type === 'create-sphere' ||
    action.type === 'create-agenda'
  )
}

// Duck-typed interface for stores that support push-based sync (e.g. ClientPalimpsestStore)
interface SubscribableStore {
  subscribe(listener: () => void): () => void
  start(): void
  stop(): void
  readonly syncHealth?: SyncHealth
  readonly unsyncedCount?: number
  readonly pendingConflicts?: PendingConflict[]
  readonly lastSyncError?: string
}

function isSubscribable(store: PalimpsestStore): store is PalimpsestStore & SubscribableStore {
  return typeof (store as any).subscribe === 'function'
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
    if (isSubscribable(store)) {
      store.start()
      const unsub = store.subscribe(() => {
        void store.getState().then(applyState)
        setSyncHealth(store.syncHealth ?? 'idle')
        setUnsyncedCount(store.unsyncedCount ?? 0)
        setPendingConflicts(store.pendingConflicts ?? [])
        setLastSyncError(store.lastSyncError)
      })
      return () => { unsub(); store.stop() }
    } else {
      void store.getState().then(applyState)
    }
  }, [store, applyState])

  async function refreshProj(): Promise<ProjectionState> {
    const next = await store.getState()
    setProjState(next)
    return next
  }

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
            await store.appendEvents(createTask(resolvedState, { title: action.title, projectId }))
            const next = await refreshProj()
            const newTasks = listTasks(next, { projectId, status: 'open' })
            setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: newTasks.length - 1 } }))
          } else if (sphereId !== undefined) {
            await store.appendEvents(createTask(resolvedState, { title: action.title, sphereId }))
            const next = await refreshProj()
            const newTasks = listTasks(next, { sphereId, status: 'open' })
            setUIState(prev => uiReducer(prev, { type: 'update-nav', patch: { selected: newTasks.length - 1 } }))
          }
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-task': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { title: action.title } }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-task-description': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { description: action.description } }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-due-date': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { dueDate: action.dueDate } }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-due-date-expression': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { dueDateExpression: action.dueDateExpression } }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'complete-task': {
          await store.appendEvents(completeTask(resolvedState, action.taskId))
          const next = await refreshProj()
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
          await store.appendEvents(uncompleteTask(resolvedState, action.taskId))
          const next = await refreshProj()
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
          const task = resolvedState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { isNext: task.isNext !== true } }))
            await refreshProj()
          }
          break
        }

        case 'toggle-starred': {
          const task = resolvedState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { isStarred: task.isStarred !== true } }))
            await refreshProj()
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
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'set-task-agenda': {
          await store.appendEvents(updateTask(resolvedState, { taskId: action.taskId, patch: { agendaId: action.agendaId } }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'create-project': {
          await store.appendEvents(createProject(resolvedState, { name: action.name, sphereId: action.sphereId }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'edit-project': {
          await store.appendEvents(updateProject(resolvedState, action.projectId, { name: action.name }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'list' }))
          break
        }

        case 'archive-project': {
          await store.appendEvents(archiveProject(resolvedState, action.projectId))
          const next = await refreshProj()
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
          await store.appendEvents(unarchiveProject(resolvedState, action.projectId))
          const next = await refreshProj()
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
          await store.appendEvents(createSphere(resolvedState, { name: action.name }))
          const next = await refreshProj()
          setUIState(prev => ({
            ...uiReducer(prev, { type: 'set-mode', mode: 'settings' }),
            currentSphereId: prev.currentSphereId ?? listSpheres(next)[0]?.id,
          }))
          break
        }

        case 'create-agenda': {
          await store.appendEvents(createAgenda(resolvedState, { title: action.title, sphereId: action.sphereId }))
          await refreshProj()
          setUIState(prev => uiReducer(prev, { type: 'set-mode', mode: 'settings' }))
          break
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedState, uiState, vm])

  return { ...vm, projState: resolvedState, uiState, commands, dispatch, isLoading, syncHealth, unsyncedCount, pendingConflicts, lastSyncError }
}
