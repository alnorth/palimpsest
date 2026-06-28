import type { TaskId, ProjectId, SphereId, AgendaId, ContextId } from 'palimpsest'
import type { CLEAR } from 'palimpsest'

export type TopLevelView = 'dashboard' | 'tasks' | 'projects' | 'processing'

export type View =
  | 'dashboard' | 'tasks' | 'projects' | 'project' | 'task' | 'processing'
  | 'picking-view'
  | 'picking-agenda-for-task'
  | 'picking-context-for-task'
  | 'picking-due-date'
  | 'picking-project-for-task'

export type Mode =
  | { type: 'adding'; formValue: string }
  | { type: 'editing-task'; formValue: string }
  | { type: 'editing-description'; formValue: string }
  | { type: 'editing-due-date'; formValue: string }
  | { type: 'adding-project'; formValue: string }
  | { type: 'editing-project'; formValue: string }
  | { type: 'editing-recurrence'; formValue: string }

export type ModeType = Mode['type']

export type NavState =
  | { view: 'dashboard'; selected: number }
  | { view: 'tasks'; selected: number; showCompleted: boolean }
  | { view: 'projects'; selected: number; showArchived: boolean }
  | { view: 'processing'; selected: number }
  | { view: 'project'; selected: number; activeProjectId: ProjectId; showCompleted: boolean }
  | { view: 'task'; activeTaskId: TaskId }
  | { view: 'picking-view'; selected: number }
  | { view: 'picking-agenda-for-task'; selected: number; activeTaskId: TaskId }
  | { view: 'picking-context-for-task'; selected: number; activeTaskId: TaskId }
  | { view: 'picking-due-date'; selected: number; activeTaskId: TaskId }
  | { view: 'picking-project-for-task'; selected: number; activeTaskId: TaskId; searchQuery: string }

export const INITIAL_NAV = {
  view: 'dashboard' as const,
  selected: 0,
} satisfies NavState

export interface UIState {
  currentSphereId: SphereId | undefined
  navStack: NavState[]
  mode: Mode | undefined
}

export const INITIAL_UI_STATE: UIState = {
  currentSphereId: undefined,
  navStack: [INITIAL_NAV],
  mode: undefined,
}

export type UIAction =
  | { type: 'navigate'; navState: NavState }
  | { type: 'set-nav'; navState: NavState }
  | { type: 'go-back' }
  | { type: 'update-nav'; patch: { selected?: number; searchQuery?: string } }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'exit-mode' }
  | { type: 'update-mode'; formValue: string }
  | { type: 'set-sphere'; sphereId: SphereId }
  | { type: 'move-up' }
  | { type: 'move-down' }

export type DataAction =
  | { type: 'create-task'; title: string; projectId?: ProjectId; sphereId?: SphereId }
  | { type: 'edit-task'; taskId: TaskId; title: string }
  | { type: 'edit-task-description'; taskId: TaskId; description: string }
  | { type: 'set-task-due-date'; taskId: TaskId; dueDate: string | typeof CLEAR }
  | { type: 'set-task-due-date-expression'; taskId: TaskId; dueDateExpression: string | typeof CLEAR }
  | { type: 'set-task-project'; taskId: TaskId; projectId: ProjectId | typeof CLEAR }
  | { type: 'complete-task'; taskId: TaskId }
  | { type: 'uncomplete-task'; taskId: TaskId }
  | { type: 'toggle-next'; taskId: TaskId }
  | { type: 'toggle-starred'; taskId: TaskId }
  | { type: 'toggle-waiting'; taskId: TaskId }
  | { type: 'set-task-agenda'; taskId: TaskId; agendaId: AgendaId | typeof CLEAR }
  | { type: 'set-task-context'; taskId: TaskId; contextId: ContextId | typeof CLEAR }
  | { type: 'create-project'; name: string; sphereId: SphereId }
  | { type: 'create-and-assign-project'; name: string; sphereId: SphereId; taskId: TaskId }
  | { type: 'edit-project'; projectId: ProjectId; name: string }
  | { type: 'archive-project'; projectId: ProjectId }
  | { type: 'unarchive-project'; projectId: ProjectId }

export type Action = UIAction | DataAction

export type CommandId =
  | 'add-task'
  | 'add-project'
  | 'edit-task'
  | 'edit-description'
  | 'edit-project'
  | 'complete-task'
  | 'uncomplete-task'
  | 'toggle-next'
  | 'star'
  | 'toggle-waiting'
  | 'pick-due-date'
  | 'set-recurrence'
  | 'pick-project'
  | 'pick-agenda'
  | 'pick-context'
  | 'archive-project'
  | 'unarchive-project'
  | 'view-project'
  | 'toggle-completed'
  | 'toggle-archived'
  | 'pick-view'
  | 'cycle-sphere'

export interface Command {
  id: CommandId
  label: string
  group: 'state' | 'create' | 'view'
  key: string
  action: Action
}
