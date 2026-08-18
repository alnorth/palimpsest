import type { ContextJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import { toPaginated } from './internal/toPaginated'
import type { Paginated, SphereScopedFilter } from './types'

export function useContexts(filter: SphereScopedFilter = {}): Paginated<ContextJson> {
  const raw = useRunQuery({
    kind: 'contexts',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return toPaginated<ContextJson>(raw, 'contexts')
}
