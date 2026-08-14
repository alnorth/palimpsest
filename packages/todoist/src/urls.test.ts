import { describe, it, expect } from 'vitest'
import { attachTodoistUrls } from './urls'

// Minimal task-shaped and project-shaped fixtures matching the fingerprint attachTodoistUrls
// looks for — real TaskJson/ProjectJson objects (from @alnorth/palimpsest-query) carry more
// fields than this, but only the fingerprint fields matter for detection.
interface TaskLike {
  id: string
  title: string
  status: string
  isNext: boolean
  isStarred: boolean
  waitingFor: null
  todoistUrl?: string
}

interface ProjectLike {
  id: string
  name: string
  openTaskCount: number
  hasNextAction: boolean
  todoistUrl?: string
}

function taskLike(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: 't1', title: 'Ship it', status: 'open', isNext: false, isStarred: false,
    waitingFor: null, ...overrides,
  }
}

function projectLike(overrides: Partial<ProjectLike> = {}): ProjectLike {
  return {
    id: 'p1', name: 'Launch', openTaskCount: 2, hasNextAction: true, ...overrides,
  }
}

describe('attachTodoistUrls', () => {
  it('attaches todoistUrl to a task-shaped object', () => {
    const result = attachTodoistUrls(taskLike())
    expect(result.todoistUrl).toBe('https://todoist.com/app/task/t1')
  })

  it('attaches todoistUrl to a project-shaped object', () => {
    const result = attachTodoistUrls(projectLike())
    expect(result.todoistUrl).toBe('https://todoist.com/app/project/p1')
  })

  it('walks arrays of task-shaped objects', () => {
    const result = attachTodoistUrls([taskLike({ id: 't1' }), taskLike({ id: 't2' })])
    expect(result.map(t => t.todoistUrl)).toEqual([
      'https://todoist.com/app/task/t1',
      'https://todoist.com/app/task/t2',
    ])
  })

  it('walks task/project-shaped objects nested inside arbitrary object/array structures', () => {
    const result = attachTodoistUrls({
      ok: true,
      groups: [
        { kind: 'review', tasks: [taskLike({ id: 't1' })] },
      ],
      project: projectLike({ id: 'p1' }),
    })
    expect(result.groups[0]?.tasks[0]?.todoistUrl).toBe('https://todoist.com/app/task/t1')
    expect(result.project.todoistUrl).toBe('https://todoist.com/app/project/p1')
  })

  it('leaves non-task/project objects untouched', () => {
    const sphereLike = { id: 's1', name: 'Work', description: null }
    const result = attachTodoistUrls(sphereLike)
    expect(result).not.toHaveProperty('todoistUrl')
  })

  it('leaves primitives and null untouched', () => {
    expect(attachTodoistUrls(null)).toBeNull()
    expect(attachTodoistUrls(42)).toBe(42)
    expect(attachTodoistUrls('hi')).toBe('hi')
    expect(attachTodoistUrls(true)).toBe(true)
  })

  it('does not mutate the original object', () => {
    const original = taskLike()
    attachTodoistUrls(original)
    expect(original).not.toHaveProperty('todoistUrl')
  })
})
