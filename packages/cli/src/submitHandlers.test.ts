import { describe, test, expect, vi } from 'vitest'
import { CLEAR } from 'palimpsest'
import type { Task, Project, Sphere, TaskId, ProjectId, SphereId } from 'palimpsest'
import type { Action } from 'palimpsest-ui-core'
import {
  handleTaskSubmit,
  handleEditSubmit,
  handleEditDescriptionSubmit,
  handleDueDateSubmit,
  handleRecurrenceSubmit,
  handleProjectSubmit,
  handleEditProjectSubmit,
} from './submitHandlers.js'

const SPHERE: Sphere = {
  id: 'sph1' as SphereId,
  name: 'Personal',
}

const PROJECT: Project = {
  id: 'proj1' as ProjectId,
  sphereId: 'sph1' as SphereId,
  name: 'My Project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const TASK: Task = {
  id: 'task1' as TaskId,
  title: 'Old title',
  description: '',
  status: 'open',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sphereId: 'sph1' as SphereId,
}

function makeDispatch() {
  return vi.fn<(action: Action) => void>()
}

describe('handleTaskSubmit', () => {
  test('non-blank title dispatches create-task with title and sphereId', () => {
    const dispatch = makeDispatch()
    handleTaskSubmit('Buy milk', 'tasks', undefined, SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'create-task', title: 'Buy milk', sphereId: SPHERE.id })
  })

  test('whitespace-only title dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleTaskSubmit('   ', 'tasks', undefined, SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('title is trimmed before dispatch', () => {
    const dispatch = makeDispatch()
    handleTaskSubmit('  Buy milk  ', 'tasks', undefined, SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'create-task', title: 'Buy milk', sphereId: SPHERE.id })
  })

  test('view=project includes projectId from activeProject', () => {
    const dispatch = makeDispatch()
    handleTaskSubmit('Buy milk', 'project', PROJECT, SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'create-task',
      title: 'Buy milk',
      projectId: PROJECT.id,
      sphereId: SPHERE.id,
    })
  })

  test('non-project view does not include projectId even if activeProject set', () => {
    const dispatch = makeDispatch()
    handleTaskSubmit('Buy milk', 'tasks', PROJECT, SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'create-task', title: 'Buy milk', sphereId: SPHERE.id })
  })
})

describe('handleEditSubmit', () => {
  test('non-blank title dispatches edit-task with taskId and title', () => {
    const dispatch = makeDispatch()
    handleEditSubmit('New title', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit-task', taskId: TASK.id, title: 'New title' })
  })

  test('whitespace-only title dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleEditSubmit('  ', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('currentTask undefined dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleEditSubmit('New title', undefined, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('title is trimmed before dispatch', () => {
    const dispatch = makeDispatch()
    handleEditSubmit('  New title  ', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit-task', taskId: TASK.id, title: 'New title' })
  })
})

describe('handleEditDescriptionSubmit', () => {
  test('dispatches edit-task-description with trimmed description', () => {
    const dispatch = makeDispatch()
    handleEditDescriptionSubmit('  some notes  ', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit-task-description', taskId: TASK.id, description: 'some notes' })
  })

  test('empty description is still dispatched (clearing is valid)', () => {
    const dispatch = makeDispatch()
    handleEditDescriptionSubmit('', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit-task-description', taskId: TASK.id, description: '' })
  })

  test('currentTask undefined dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleEditDescriptionSubmit('notes', undefined, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })
})

describe('handleDueDateSubmit', () => {
  const TODAY = '2026-06-30'

  test('parseable value dispatches set-task-due-date with parsed date', () => {
    const dispatch = makeDispatch()
    handleDueDateSubmit('tomorrow', TODAY, TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-task-due-date', taskId: TASK.id, dueDate: '2026-07-01' })
  })

  test('ISO date is passed through as-is', () => {
    const dispatch = makeDispatch()
    handleDueDateSubmit('2026-12-25', TODAY, TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-task-due-date', taskId: TASK.id, dueDate: '2026-12-25' })
  })

  test('unparseable value does not dispatch', () => {
    const dispatch = makeDispatch()
    handleDueDateSubmit('not a date', TODAY, TASK, dispatch)
    expect(dispatch).not.toHaveBeenCalled()
  })

  test('currentTask undefined does not dispatch', () => {
    const dispatch = makeDispatch()
    handleDueDateSubmit('tomorrow', TODAY, undefined, dispatch)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('handleRecurrenceSubmit', () => {
  test('valid expression dispatches set-task-due-date-expression', () => {
    const dispatch = makeDispatch()
    handleRecurrenceSubmit('weekly', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-task-due-date-expression', taskId: TASK.id, dueDateExpression: 'weekly' })
  })

  test('empty string dispatches with CLEAR to remove expression', () => {
    const dispatch = makeDispatch()
    handleRecurrenceSubmit('', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-task-due-date-expression', taskId: TASK.id, dueDateExpression: CLEAR })
  })

  test('whitespace-only string dispatches with CLEAR', () => {
    const dispatch = makeDispatch()
    handleRecurrenceSubmit('   ', TASK, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-task-due-date-expression', taskId: TASK.id, dueDateExpression: CLEAR })
  })

  test('invalid expression does not dispatch', () => {
    const dispatch = makeDispatch()
    handleRecurrenceSubmit('not a recurrence', TASK, dispatch)
    expect(dispatch).not.toHaveBeenCalled()
  })

  test('currentTask undefined does not dispatch', () => {
    const dispatch = makeDispatch()
    handleRecurrenceSubmit('weekly', undefined, dispatch)
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('handleProjectSubmit', () => {
  test('non-blank name dispatches create-project with name and sphereId', () => {
    const dispatch = makeDispatch()
    handleProjectSubmit('Website', SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'create-project', name: 'Website', sphereId: SPHERE.id })
  })

  test('whitespace-only name dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleProjectSubmit('  ', SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('activeSphere undefined dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleProjectSubmit('Website', undefined, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('name is trimmed before dispatch', () => {
    const dispatch = makeDispatch()
    handleProjectSubmit('  Website  ', SPHERE, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'create-project', name: 'Website', sphereId: SPHERE.id })
  })
})

describe('handleEditProjectSubmit', () => {
  test('non-blank name dispatches edit-project with projectId and name', () => {
    const dispatch = makeDispatch()
    handleEditProjectSubmit('New Name', PROJECT, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'edit-project', projectId: PROJECT.id, name: 'New Name' })
  })

  test('whitespace-only name dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleEditProjectSubmit('  ', PROJECT, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })

  test('selectedProject undefined dispatches exit-mode', () => {
    const dispatch = makeDispatch()
    handleEditProjectSubmit('New Name', undefined, dispatch)
    expect(dispatch).toHaveBeenCalledWith({ type: 'exit-mode' })
  })
})
