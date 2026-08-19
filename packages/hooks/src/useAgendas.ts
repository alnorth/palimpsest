import type { AgendaJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import { toPaginated } from './internal/toPaginated'
import type { Paginated, SphereScopedFilter } from './types'

export function useAgendas(filter: SphereScopedFilter = {}): Paginated<AgendaJson> {
  const raw = useRunQuery({
    kind: 'agendas',
    ...(filter.sphere !== undefined && { sphere: filter.sphere }),
  })
  return toPaginated<AgendaJson>(raw, 'agendas')
}
