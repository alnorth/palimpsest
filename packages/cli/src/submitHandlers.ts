import { parseDueDate, isValidExpression, CLEAR } from 'palimpsest'
import type { Task, Project, Sphere } from 'palimpsest'
import type { Action, View } from 'palimpsest-ui-core'

type Dispatch = (action: Action) => void

export function handleTaskSubmit(title: string, view: View, activeProject: Project | undefined, activeSphere: Sphere | undefined, dispatch: Dispatch): void {
  const trimmed = title.trim()
  if (trimmed) {
    const projectId = view === 'project' ? activeProject?.id : undefined
    dispatch({
      type: 'create-task',
      title: trimmed,
      ...(projectId !== undefined && { projectId }),
      ...(activeSphere !== undefined && { sphereId: activeSphere.id }),
    })
  } else {
    dispatch({ type: 'exit-mode' })
  }
}

export function handleEditSubmit(title: string, currentTask: Task | undefined, dispatch: Dispatch): void {
  const trimmed = title.trim()
  if (trimmed && currentTask !== undefined) {
    dispatch({ type: 'edit-task', taskId: currentTask.id, title: trimmed })
  } else {
    dispatch({ type: 'exit-mode' })
  }
}

export function handleEditDescriptionSubmit(description: string, currentTask: Task | undefined, dispatch: Dispatch): void {
  if (currentTask !== undefined) {
    dispatch({ type: 'edit-task-description', taskId: currentTask.id, description: description.trim() })
  } else {
    dispatch({ type: 'exit-mode' })
  }
}

export function handleDueDateSubmit(value: string, today: string, currentTask: Task | undefined, dispatch: Dispatch): void {
  const parsed = parseDueDate(value, today)
  if (parsed !== null && currentTask !== undefined) {
    dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: parsed })
  }
}

export function handleRecurrenceSubmit(value: string, currentTask: Task | undefined, dispatch: Dispatch): void {
  const trimmed = value.trim()
  if (currentTask === undefined) return
  if (trimmed === '') {
    dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: CLEAR })
  } else if (isValidExpression(trimmed)) {
    dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: trimmed })
  }
}

export function handleProjectSubmit(name: string, activeSphere: Sphere | undefined, dispatch: Dispatch): void {
  const trimmed = name.trim()
  if (trimmed && activeSphere !== undefined) {
    dispatch({ type: 'create-project', name: trimmed, sphereId: activeSphere.id })
  } else {
    dispatch({ type: 'exit-mode' })
  }
}

export function handleEditProjectSubmit(name: string, selectedProject: Project | undefined, dispatch: Dispatch): void {
  const trimmed = name.trim()
  if (trimmed && selectedProject !== undefined) {
    dispatch({ type: 'edit-project', projectId: selectedProject.id, name: trimmed })
  } else {
    dispatch({ type: 'exit-mode' })
  }
}
