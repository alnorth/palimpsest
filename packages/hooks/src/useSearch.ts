import type { SearchResultJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { ListResult } from './types'

export interface SearchFilter {
  sphere?: string
  includeArchived?: boolean
  limit?: number
}

// Callers are expected to pass their own live-typed input straight through on every keystroke
// (no debouncing here) — @alnorth/palimpsest-query's searchAll rebuilds its MiniSearch index from
// scratch per call, which is cheap enough at personal-task-manager scale, and useRunQuery already
// memoizes by the command's JSON content so an unchanged query between renders is a no-op.
export function useSearch(query: string, filter: SearchFilter = {}): ListResult<SearchResultJson> {
  const trimmed = query.trim()
  const command = trimmed !== '' ? {
    kind: 'search' as const,
    query: trimmed,
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
    ...(filter.includeArchived !== undefined && { includeArchived: filter.includeArchived }),
    ...(filter.limit !== undefined && { limit: filter.limit }),
  } : undefined
  const { raw, isLoading, error } = useRunQuery(command)

  if (trimmed === '') {
    return { data: [], isLoading: false, error: undefined, total: 0, truncated: false }
  }

  return {
    data: raw !== undefined ? raw.results as SearchResultJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
