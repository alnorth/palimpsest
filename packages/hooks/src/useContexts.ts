import type { ContextJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { Paginated, SphereScopedFilter } from './types'

export function useContexts(filter: SphereScopedFilter = {}): Paginated<ContextJson> {
  const raw = useRunQuery({
    kind: 'contexts',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return {
    items: (raw?.contexts ?? []) as ContextJson[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
