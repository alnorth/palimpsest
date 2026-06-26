import type { TaskId, ProjectId, SphereId, AgendaId } from 'palimpsest'
import type { CLEAR } from 'palimpsest'

export type View = 'tasks' | 'projects' | 'project' | 'task'

export type Mode =
  | 'list'
  | 'picking-view'
  | 'adding'
  | 'editing-task'
  | 'editing-description'
  | 'picking-agenda-for-task'
  | 'picking-due-date'
  | 'editing-due-date'
  | 'picking-project-for-task'
  | 'adding-project'
  | 'editing-project'
  | 'editing-recurrence'

export interface NavState {
  view: View
  selected: number
  activeProjectId: ProjectId | undefined
  activeTaskId: TaskId | undefined
  showCompleted: boolean
  showArchived: boolean
}

export const INITIAL_NAV: NavState = {
  view: 'tasks',
  selected: 0,
  activeProjectId: undefined,
  activeTaskId: undefined,
  showCompleted: false,
  showArchived: false,
}

export interface UIState {
  currentSphereId: SphereId | undefined
  navStack: NavState[]
  mode: Mode
  viewPickerSelected: number
  agendaPickerSelected: number
  dueDatePickerSelected: number
  projectPickerSelected: number
}

export const INITIAL_UI_STATE: UIState = {
  currentSphereId: undefined,
  navStack: [INITIAL_NAV],
  mode: 'list',
  viewPickerSelected: 0,
  agendaPickerSelected: 0,
  dueDatePickerSelected: 0,
  projectPickerSelected: 0,
}

export type UIAction =
  | { type: 'navigate'; navState: NavState }
  | { type: 'set-nav'; navState: NavState }
  | { type: 'go-back' }
  | { type: 'update-nav'; patch: Partial<NavState> }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-sphere'; sphereId: SphereId }
  | { type: 'set-view-picker-selected'; index: number }
  | { type: 'set-agenda-picker-selected'; index: number }
  | { type: 'set-due-date-picker-selected'; index: number }
  | { type: 'set-project-picker-selected'; index: number }

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
  | { type: 'set-task-agenda'; taskId: TaskId; agendaId: AgendaId | typeof CLEAR }
  | { type: 'create-project'; name: string; sphereId: SphereId }
  | { type: 'edit-project'; projectId: ProjectId; name: string }
  | { type: 'archive-project'; projectId: ProjectId }
  | { type: 'unarchive-project'; projectId: ProjectId }

export type Action = UIAction | DataAction

export interface Command {
  id: string
  label: string
  group: 'state' | 'view'
  key: string
  action: Action
}
