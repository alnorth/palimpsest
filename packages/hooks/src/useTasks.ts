import type { TaskJson, StatusArg } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { ListResult } from './types'

export interface TasksFilter {
  sphere?: string
  project?: string
  agenda?: string
  context?: string
  status?: StatusArg
  starred?: boolean
  actionable?: boolean
  waiting?: boolean
  notWaiting?: boolean
  inbox?: boolean
  dueOn?: string
  dueBefore?: string
  hasDueDate?: boolean
  withoutDueDate?: boolean
  hasAgenda?: boolean
  withoutAgenda?: boolean
  hasContext?: boolean
  withoutContext?: boolean
  includeArchived?: boolean
  limit?: number
}

export function useTasks(filter: TasksFilter = {}): ListResult<TaskJson> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'tasks',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
    ...(filter.project !== undefined && { project: filter.project }),
    ...(filter.agenda !== undefined && { agenda: filter.agenda }),
    ...(filter.context !== undefined && { context: filter.context }),
    ...(filter.status !== undefined && { status: filter.status }),
    ...(filter.starred !== undefined && { starred: filter.starred }),
    ...(filter.actionable !== undefined && { actionable: filter.actionable }),
    ...(filter.waiting !== undefined && { waiting: filter.waiting }),
    ...(filter.notWaiting !== undefined && { notWaiting: filter.notWaiting }),
    ...(filter.inbox !== undefined && { noProject: filter.inbox }),
    ...(filter.dueOn !== undefined && { dueOn: filter.dueOn }),
    ...(filter.dueBefore !== undefined && { dueBefore: filter.dueBefore }),
    ...(filter.hasDueDate !== undefined && { hasDueDate: filter.hasDueDate }),
    ...(filter.withoutDueDate !== undefined && { withoutDueDate: filter.withoutDueDate }),
    ...(filter.hasAgenda !== undefined && { hasAgenda: filter.hasAgenda }),
    ...(filter.withoutAgenda !== undefined && { withoutAgenda: filter.withoutAgenda }),
    ...(filter.hasContext !== undefined && { hasContext: filter.hasContext }),
    ...(filter.withoutContext !== undefined && { withoutContext: filter.withoutContext }),
    ...(filter.includeArchived !== undefined && { includeArchived: filter.includeArchived }),
    ...(filter.limit !== undefined && { limit: filter.limit }),
  })
  return {
    data: raw !== undefined ? raw.tasks as TaskJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
