import type { TaskId, ProjectId } from '@alnorth/palimpsest'
import { todoistTaskUrl, todoistProjectUrl } from './mapping'

function isTaskLike(v: Record<string, unknown>): boolean {
  return typeof v['id'] === 'string' && typeof v['title'] === 'string' &&
    'waitingFor' in v && 'isNext' in v
}

function isProjectLike(v: Record<string, unknown>): boolean {
  return typeof v['id'] === 'string' && typeof v['name'] === 'string' &&
    'openTaskCount' in v && 'hasNextAction' in v
}

// Recursively walks a runQuery() result — a plain JSON value where TaskJson/ProjectJson objects
// (from @alnorth/palimpsest-query) can be nested at any depth (single task, lists, dashboard/
// waiting/pick_list groups, etc.) — and attaches a todoistUrl to every task-shaped and
// project-shaped object found. Detection is structural (id + a couple of fingerprint fields)
// rather than nominal, since packages/todoist doesn't depend on packages/query; that's safe here
// because a palimpsest Task/Project id backed by TodoistStore *is* the Todoist item/project id
// verbatim (see mapping.ts's todoistTaskUrl/todoistProjectUrl).
export function attachTodoistUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => attachTodoistUrls(v)) as T
  }
  if (value !== null && typeof value === 'object') {
    const walked: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      walked[key] = attachTodoistUrls(v)
    }
    if (isTaskLike(walked)) walked['todoistUrl'] = todoistTaskUrl(walked['id'] as TaskId)
    else if (isProjectLike(walked)) walked['todoistUrl'] = todoistProjectUrl(walked['id'] as ProjectId)
    return walked as T
  }
  return value
}
