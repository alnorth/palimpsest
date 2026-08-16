import type { ProjectJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { ListResult } from './types'

export interface ProjectsFilter {
  sphere?: string
  archived?: boolean
  all?: boolean
  agenda?: string
  hasAgenda?: boolean
  withoutAgenda?: boolean
  isSelfOnly?: boolean
  includeNextTasks?: boolean
}

export function useProjects(filter: ProjectsFilter = {}): ListResult<ProjectJson> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'projects',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
    ...(filter.archived !== undefined && { archived: filter.archived }),
    ...(filter.all !== undefined && { all: filter.all }),
    ...(filter.agenda !== undefined && { agenda: filter.agenda }),
    ...(filter.hasAgenda !== undefined && { hasAgenda: filter.hasAgenda }),
    ...(filter.withoutAgenda !== undefined && { withoutAgenda: filter.withoutAgenda }),
    ...(filter.isSelfOnly !== undefined && { isSelfOnly: filter.isSelfOnly }),
    ...(filter.includeNextTasks !== undefined && { includeNextTasks: filter.includeNextTasks }),
  })
  return {
    data: raw !== undefined ? raw.projects as ProjectJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
