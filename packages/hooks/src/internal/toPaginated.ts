import type { Paginated } from '../types'

export function toPaginated<T>(raw: Record<string, unknown> | undefined, listKey: string): Paginated<T> {
  return {
    items: (raw?.[listKey] ?? []) as T[],
    total: (raw?.total ?? 0) as number,
    truncated: (raw?.truncated ?? false) as boolean,
  }
}
