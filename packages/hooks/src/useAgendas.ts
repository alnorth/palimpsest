import type { AgendaJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { Paginated, SphereScopedFilter } from './types'

export function useAgendas(filter: SphereScopedFilter = {}): Paginated<AgendaJson> {
  const raw = useRunQuery({
    kind: 'agendas',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return {
    items: (raw?.agendas ?? []) as AgendaJson[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
