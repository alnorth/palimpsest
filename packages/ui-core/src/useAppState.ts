import { useState, useMemo, useCallback, useEffect, useReducer } from 'react'
import {
  listTasks, listProjects,
  createTask, updateTask, completeTask, uncompleteTask,
  createProject, updateProject, archiveProject, unarchiveProject,
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
import type { NavState } from './types.js'

function navSelected(nav: NavState | undefined): number {
  return nav !== undefined && 'selected' in nav ? nav.selected : 0
}

export interface AppStateResult extends ViewModel {
  projState: ProjectionState
  commands: Command[]
  dispatch: (action: Action) => void
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
    action.type === 'toggle-waiting' ||
    action.type === 'set-task-project' ||
    action.type === 'set-task-agenda' ||
    action.type === 'set-task-context' ||
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

export function useAppState(store: PalimpsestStore, initialState: ProjectionState): AppStateResult {
  const [projState, setProjState] = useState<ProjectionState>(initialState)
  const [uiState, dispatchUI] = useReducer(uiReducer, {
    ...INITIAL_UI_STATE,
    currentSphereId: initialState.spheres.values().next().value?.id,
  })
  const [syncHealth, setSyncHealth] = useState<SyncHealth>('idle')
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [pendingConflicts, setPendingConflicts] = useState<PendingConflict[]>([])
  const [lastSyncError, setLastSyncError] = useState<string | undefined>(undefined)

  useEffect(() => {
    const unsubFn = store.subscribe(() => {
      void store.getState().then(setProjState).catch(() => {})
      if (hasSyncHealth(store)) {
        setSyncHealth(store.syncHealth)
        setUnsyncedCount(store.unsyncedCount)
        setPendingConflicts(store.pendingConflicts)
        setLastSyncError(store.lastSyncError)
      }
    })
    store.start()
    return () => {
      unsubFn()
      store.stop()
    }
  }, [store])

  const vm = useMemo(() => deriveViewModel(projState, uiState), [projState, uiState])
  const commands = useMemo(() => getCommands(vm), [vm])

  const dispatch = useCallback((action: Action) => {
    if (!isDataAction(action)) {
      dispatchUI(action as UIAction)
      return
    }

    void (async () => {
      switch (action.type) {
        case 'create-task': {
          const sphereId = action.sphereId ?? vm.activeSphere?.id
          const projectId = action.projectId
          if (projectId !== undefined) {
            const tasks = listTasks(projState, { projectId, status: 'open' })
            await store.appendEvents(createTask({ title: action.title, projectId }))
            dispatchUI({ type: 'update-nav', patch: { selected: indexAfterAppend(tasks) } })
          } else if (sphereId !== undefined) {
            const tasks = listTasks(projState, { sphereId, status: 'open' })
            await store.appendEvents(createTask({ title: action.title, sphereId }))
            dispatchUI({ type: 'update-nav', patch: { selected: indexAfterAppend(tasks) } })
          }
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'edit-task': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { title: action.title }))
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'edit-task-description': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { description: action.description }))
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'set-task-due-date': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { dueDate: action.dueDate }))
          dispatchUI({ type: 'go-back' })
          break
        }

        case 'set-task-due-date-expression': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { dueDateExpression: action.dueDateExpression }))
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'complete-task': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          if (vm.view !== 'task') {
            let tasks: typeof vm.dashboardTasks
            if (vm.view === 'dashboard') {
              tasks = vm.dashboardTasks
            } else {
              const activeProjectId = vm.activeProject?.id
              const activeSphereId = vm.activeSphere?.id
              tasks = activeProjectId !== undefined
                ? listTasks(projState, { projectId: activeProjectId, status: 'open' })
                : activeSphereId !== undefined
                  ? listTasks(projState, { sphereId: activeSphereId, status: 'open' })
                  : []
            }
            await store.appendEvents(completeTask(task))
            dispatchUI({
              type: 'update-nav',
              patch: { selected: indexAfterRemove(tasks, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
            })
          } else {
            await store.appendEvents(completeTask(task))
          }
          break
        }

        case 'uncomplete-task': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          if (vm.view !== 'task') {
            const activeProjectId = vm.activeProject?.id
            const activeSphereId = vm.activeSphere?.id
            const tasks = activeProjectId !== undefined
              ? listTasks(projState, { projectId: activeProjectId, status: 'completed' })
              : activeSphereId !== undefined
                ? listTasks(projState, { sphereId: activeSphereId, status: 'completed' })
                : []
            await store.appendEvents(uncompleteTask(task))
            dispatchUI({
              type: 'update-nav',
              patch: { selected: indexAfterRemove(tasks, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
            })
          } else {
            await store.appendEvents(uncompleteTask(task))
          }
          break
        }

        case 'toggle-next': {
          const task = projState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(task, { isNext: task.isNext !== true }))
          }
          break
        }

        case 'toggle-starred': {
          const task = projState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(task, { isStarred: task.isStarred !== true }))
          }
          break
        }

        case 'toggle-waiting': {
          const task = projState.tasks.get(action.taskId)
          if (task !== undefined) {
            await store.appendEvents(updateTask(task, { isWaiting: task.isWaiting !== true }))
          }
          break
        }

        case 'set-task-project': {
          const task = projState.tasks.get(action.taskId)
          if (task === undefined) break
          if (action.projectId === CLEAR) {
            const sphereId =
              task.sphereId ??
              (task.projectId !== undefined ? projState.projects.get(task.projectId)?.sphereId : undefined) ??
              vm.activeSphere?.id
            if (sphereId === undefined) break
            await store.appendEvents(updateTask(task, { projectId: CLEAR, sphereId }))
          } else {
            await store.appendEvents(updateTask(task, { projectId: action.projectId, sphereId: CLEAR }))
          }
          dispatchUI({ type: 'go-back' })
          break
        }

        case 'set-task-agenda': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { agendaId: action.agendaId }))
          dispatchUI({ type: 'go-back' })
          break
        }

        case 'set-task-context': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(updateTask(task, { contextId: action.contextId }))
          dispatchUI({ type: 'go-back' })
          break
        }

        case 'create-project': {
          await store.appendEvents(createProject({ name: action.name, sphereId: action.sphereId }))
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'create-and-assign-project': {
          const createEvts = createProject({ name: action.name, sphereId: action.sphereId })
          const projectId = (createEvts[0] as ProjectCreatedEvent).projectId
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          const assignEvts = updateTask(task, { projectId, sphereId: CLEAR })
          await store.appendEvents([...createEvts, ...assignEvts])
          dispatchUI({ type: 'go-back' })
          break
        }

        case 'edit-project': {
          const project = projState.projects.get(action.projectId)
          if (!project) break
          await store.appendEvents(updateProject(project, { name: action.name }))
          dispatchUI({ type: 'set-mode', mode: 'list' })
          break
        }

        case 'archive-project': {
          const project = projState.projects.get(action.projectId)
          if (!project) break
          const activeSphereId = vm.activeSphere?.id
          const projects = activeSphereId !== undefined
            ? listProjects(projState, { sphereId: activeSphereId, isArchived: false })
            : []
          await store.appendEvents(archiveProject(project))
          dispatchUI({
            type: 'update-nav',
            patch: { selected: indexAfterRemove(projects, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
          })
          break
        }

        case 'unarchive-project': {
          const project = projState.projects.get(action.projectId)
          if (!project) break
          const activeSphereId = vm.activeSphere?.id
          const projects = activeSphereId !== undefined
            ? listProjects(projState, { sphereId: activeSphereId, isArchived: true })
            : []
          await store.appendEvents(unarchiveProject(project))
          dispatchUI({
            type: 'update-nav',
            patch: { selected: indexAfterRemove(projects, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
          })
          break
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, uiState, vm])

  return { ...vm, projState, commands, dispatch, syncHealth, unsyncedCount, pendingConflicts, lastSyncError }
}
