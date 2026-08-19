import type { SphereJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import { toPaginated } from './internal/toPaginated'
import type { Paginated } from './types'

export function useSpheres(): Paginated<SphereJson> {
  const raw = useRunQuery({ kind: 'spheres' })
  return toPaginated<SphereJson>(raw, 'spheres')
}
