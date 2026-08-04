import type { SphereJson } from 'palimpsest-query'
import { useRunQuery } from './internal/useRunQuery.js'
import type { ListResult } from './types.js'

export function useSpheres(): ListResult<SphereJson> {
  const { raw, isLoading, error } = useRunQuery({ kind: 'spheres' })
  return {
    data: raw !== undefined ? raw.spheres as SphereJson[] : undefined,
    isLoading,
    error,
    total: raw !== undefined ? raw.total as number : undefined,
    truncated: raw !== undefined ? raw.truncated as boolean : undefined,
  }
}
