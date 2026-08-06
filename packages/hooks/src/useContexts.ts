import type { ContextJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery.js'
import type { ListResult, SphereScopedFilter } from './types.js'

export function useContexts(filter: SphereScopedFilter = {}): ListResult<ContextJson> {
  const { raw, isLoading, error } = useRunQuery({
    kind: 'contexts',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return {
    data: raw !== undefined ? raw.contexts as ContextJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
