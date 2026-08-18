import type { SearchResultJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { Paginated } from './types'

export interface SearchFilter {
  sphere?: string
  includeArchived?: boolean
  limit?: number
}

// Callers are expected to pass their own live-typed input straight through on every keystroke
// (no debouncing here) — @alnorth/palimpsest-query's searchAll rebuilds its MiniSearch index from
// scratch per call, which is cheap enough at personal-task-manager scale, and useRunQuery already
// memoizes by the command's JSON content so an unchanged query between renders is a no-op.
export function useSearch(query: string, filter: SearchFilter = {}): Paginated<SearchResultJson> {
  const trimmed = query.trim()
  const command = trimmed !== '' ? {
    kind: 'search' as const,
    query: trimmed,
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
    ...(filter.includeArchived !== undefined && { includeArchived: filter.includeArchived }),
    ...(filter.limit !== undefined && { limit: filter.limit }),
  } : undefined
  const raw = useRunQuery(command)

  if (trimmed === '') {
    return { items: [], total: 0, truncated: false }
  }

  return {
    items: (raw?.results ?? []) as SearchResultJson[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
