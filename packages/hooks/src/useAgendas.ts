import type { AgendaJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery.js'
import type { ListResult, SphereScopedFilter } from './types.js'

export function useAgendas(filter: SphereScopedFilter = {}): ListResult<AgendaJson> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'agendas',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return {
    data: raw !== undefined ? raw.agendas as AgendaJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
