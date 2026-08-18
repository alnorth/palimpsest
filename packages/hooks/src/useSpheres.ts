import type { SphereJson } from '@alnorth/palimpsest-query'
import { useRunQuery } from './internal/useRunQuery'
import type { Paginated } from './types'

export function useSpheres(): Paginated<SphereJson> {
  const raw = useRunQuery({ kind: 'spheres' })
  return {
    items: (raw?.spheres ?? []) as SphereJson[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
