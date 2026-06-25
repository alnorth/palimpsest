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
  | 'adding-project'
  | 'editing-project'
  | 'settings'
  | 'creating-sphere'
  | 'picking-sphere-for-agenda'
  | 'creating-agenda'

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
  settingsSelected: number
  pickerSelected: number
  agendaSphereId: SphereId | undefined
}

export const INITIAL_UI_STATE: UIState = {
  currentSphereId: undefined,
  navStack: [INITIAL_NAV],
  mode: 'list',
  viewPickerSelected: 0,
  agendaPickerSelected: 0,
  settingsSelected: 0,
  pickerSelected: 0,
  agendaSphereId: undefined,
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
  | { type: 'set-settings-selected'; index: number }
  | { type: 'set-picker-selected'; index: number }
  | { type: 'set-agenda-sphere'; sphereId: SphereId | undefined }

export type DataAction =
  | { type: 'create-task'; title: string; projectId?: ProjectId; sphereId?: SphereId }
  | { type: 'edit-task'; taskId: TaskId; title: string }
  | { type: 'edit-task-description'; taskId: TaskId; description: string }
  | { type: 'complete-task'; taskId: TaskId }
  | { type: 'uncomplete-task'; taskId: TaskId }
  | { type: 'toggle-next'; taskId: TaskId }
  | { type: 'toggle-starred'; taskId: TaskId }
  | { type: 'set-task-agenda'; taskId: TaskId; agendaId: AgendaId | typeof CLEAR }
  | { type: 'create-project'; name: string; sphereId: SphereId }
  | { type: 'edit-project'; projectId: ProjectId; name: string }
  | { type: 'archive-project'; projectId: ProjectId }
  | { type: 'unarchive-project'; projectId: ProjectId }
  | { type: 'create-sphere'; name: string }
  | { type: 'create-agenda'; title: string; sphereId: SphereId }

export type Action = UIAction | DataAction

export interface Command {
  id: string
  label: string
  group: 'state' | 'view'
  key: string
  action: Action
}
