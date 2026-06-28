import { useMemo, useCallback, useReducer } from 'react'
import {
  listTasks,
  createTask, updateTask, completeTask, uncompleteTask,
  createProject, updateProject, archiveProject, unarchiveProject,
  CLEAR,
} from 'palimpsest'
import type { PalimpsestStore, ProjectionState, ProjectCreatedEvent } from 'palimpsest'
import { INITIAL_UI_STATE } from './types.js'
import type { UIState, Action, UIAction, DataAction, CommandId } from './types.js'
import { uiReducer } from './reducer.js'
import { deriveViewModel } from './viewModel.js'
import { getCommands } from './commands.js'
import type { ViewModel } from './viewModel.js'
import type { Command } from './types.js'
import type { SyncState } from './ClientPalimpsestStore.js'
import { useStore } from './useStore.js'
import { indexAfterAppend, indexAfterRemove, navStateForTopLevelView } from './navHelpers.js'
import type { NavState } from './types.js'

function navSelected(nav: NavState | undefined): number {
  return nav !== undefined && 'selected' in nav ? nav.selected : 0
}

export interface AppStateResult extends ViewModel {
  projState: ProjectionState
  commands: Partial<Record<CommandId, Command>>
  dispatch: (action: Action) => void
  activate: (index: number) => void
  syncState: SyncState
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

export function useAppState(store: PalimpsestStore, initialState: ProjectionState): AppStateResult {
  const { projState, syncState } = useStore(store, initialState)
  const [uiState, dispatchUI] = useReducer(uiReducer, {
    ...INITIAL_UI_STATE,
    currentSphereId: initialState.spheres.values().next().value?.id,
  })

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
          await store.appendEvents(completeTask(task))
          if (vm.view !== 'task') {
            dispatchUI({
              type: 'update-nav',
              patch: { selected: indexAfterRemove(vm.listItems.items, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
            })
          }
          break
        }

        case 'uncomplete-task': {
          const task = projState.tasks.get(action.taskId)
          if (!task) break
          await store.appendEvents(uncompleteTask(task))
          if (vm.view !== 'task') {
            dispatchUI({
              type: 'update-nav',
              patch: { selected: indexAfterRemove(vm.listItems.items, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
            })
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
          await store.appendEvents(archiveProject(project))
          dispatchUI({
            type: 'update-nav',
            patch: { selected: indexAfterRemove(vm.listItems.items, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
          })
          break
        }

        case 'unarchive-project': {
          const project = projState.projects.get(action.projectId)
          if (!project) break
          await store.appendEvents(unarchiveProject(project))
          dispatchUI({
            type: 'update-nav',
            patch: { selected: indexAfterRemove(vm.listItems.items, navSelected(uiState.navStack[uiState.navStack.length - 1])) },
          })
          break
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projState, uiState, vm])

  const activate = useCallback((i: number) => {
    if (vm.listItems.view === 'picking-view') {
      const item = vm.listItems.items[i]
      if (item !== undefined) {
        dispatch({ type: 'set-nav', navState: navStateForTopLevelView(item.id) })
      }
    } else if (vm.listItems.view === 'picking-agenda-for-task' && vm.currentTask !== undefined) {
      const item = vm.listItems.items[i]
      if (item !== undefined) dispatch({ type: 'set-task-agenda', taskId: vm.currentTask.id, agendaId: item.id ?? CLEAR })
    } else if (vm.listItems.view === 'picking-context-for-task' && vm.currentTask !== undefined) {
      const item = vm.listItems.items[i]
      if (item !== undefined) dispatch({ type: 'set-task-context', taskId: vm.currentTask.id, contextId: item.id ?? CLEAR })
    } else if (vm.listItems.view === 'picking-due-date' && vm.currentTask !== undefined) {
      const opt = vm.listItems.items[i]
      if (opt !== undefined) {
        if (opt.date !== null) dispatch({ type: 'set-task-due-date', taskId: vm.currentTask.id, dueDate: opt.date })
        else if (opt.key === 'c') dispatch({ type: 'set-mode', mode: 'editing-due-date' })
        else dispatch({ type: 'set-task-due-date', taskId: vm.currentTask.id, dueDate: CLEAR })
      }
    } else if (vm.listItems.view === 'picking-project-for-task' && vm.currentTask !== undefined) {
      const { items } = vm.listItems
      const item = items[i]
      if (item !== undefined) {
        dispatch({ type: 'set-task-project', taskId: vm.currentTask.id, projectId: item.id ?? CLEAR })
      } else if (items.length === 0 && vm.searchQuery.trim() !== '' && vm.activeSphere !== undefined) {
        dispatch({ type: 'create-and-assign-project', name: vm.searchQuery.trim(), sphereId: vm.activeSphere.id, taskId: vm.currentTask.id })
      }
    } else if (
      vm.listItems.view === 'dashboard' || vm.listItems.view === 'tasks' || vm.listItems.view === 'project' ||
      vm.listItems.view === 'projects' || vm.listItems.view === 'processing'
    ) {
      const item = vm.listItems.items[i]
      if (item?.kind === 'task') {
        dispatch({ type: 'navigate', navState: { view: 'task', activeTaskId: item.task.id } })
      } else if (item?.kind === 'project') {
        dispatch({ type: 'navigate', navState: { view: 'project', selected: 0, activeProjectId: item.project.id, showCompleted: false } })
      }
    }
  }, [vm, dispatch])

  return { ...vm, projState, commands, dispatch, activate, syncState }
}
