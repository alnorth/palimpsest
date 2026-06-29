// Thin fetch wrapper for the Todoist REST API v2.
// Uses the account's personal API token (Bearer auth).

const BASE = 'https://api.todoist.com/rest/v2'

export interface TodoistTask {
  id: string
  content: string
  description: string
  projectId: string
  labels: string[]
  priority: number        // 1 = normal (p4), 4 = urgent (p1)
  due: {
    date: string          // YYYY-MM-DD
    isRecurring: boolean
    string: string        // e.g. "every mon", "every! 3 weeks"
  } | null
  isCompleted: boolean
  createdAt: string       // ISO 8601
}

export interface TodoistProject {
  id: string
  name: string
  parentId: string | null
  isInboxProject: boolean
  isArchived: boolean
}

export interface AddTaskArgs {
  content: string
  description?: string
  projectId?: string
  labels?: string[]
  priority?: number
  dueDate?: string        // YYYY-MM-DD (non-recurring)
  dueString?: string      // natural language / recurring expression
}

export interface UpdateTaskArgs {
  content?: string
  description?: string
  labels?: string[]
  priority?: number
  dueDate?: string
  dueString?: string
}

export interface AddProjectArgs {
  name: string
  parentId: string
}

export interface UpdateProjectArgs {
  name?: string
}

async function req<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Todoist ${method} ${path} → ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function getProjects(token: string): Promise<TodoistProject[]> {
  return req<TodoistProject[]>('GET', '/projects', token)
}

export async function getAllTasks(token: string): Promise<TodoistTask[]> {
  const all: TodoistTask[] = []
  let cursor: string | undefined

  while (true) {
    const params = new URLSearchParams({ limit: '200' })
    if (cursor !== undefined) params.set('cursor', cursor)

    const res = await fetch(`${BASE}/tasks?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Todoist GET /tasks → ${res.status}`)

    const raw: unknown = await res.json()

    // REST v2 returns an array; if cursor pagination is added it may wrap in an object
    if (Array.isArray(raw)) {
      all.push(...(raw as TodoistTask[]))
      break
    } else {
      const paged = raw as { results: TodoistTask[]; nextCursor: string | null }
      all.push(...paged.results)
      if (paged.nextCursor == null) break
      cursor = paged.nextCursor
    }
  }

  return all
}

export function addTask(token: string, args: AddTaskArgs): Promise<TodoistTask> {
  return req<TodoistTask>('POST', '/tasks', token, args)
}

export function updateTask(token: string, id: string, args: UpdateTaskArgs): Promise<TodoistTask> {
  return req<TodoistTask>('POST', `/tasks/${id}`, token, args)
}

export function closeTask(token: string, id: string): Promise<void> {
  return req<void>('POST', `/tasks/${id}/close`, token)
}

export function reopenTask(token: string, id: string): Promise<void> {
  return req<void>('POST', `/tasks/${id}/reopen`, token)
}

export function deleteTask(token: string, id: string): Promise<void> {
  return req<void>('DELETE', `/tasks/${id}`, token)
}

export function addProject(token: string, args: AddProjectArgs): Promise<TodoistProject> {
  return req<TodoistProject>('POST', '/projects', token, args)
}

export function updateProject(token: string, id: string, args: UpdateProjectArgs): Promise<TodoistProject> {
  return req<TodoistProject>('POST', `/projects/${id}`, token, args)
}
