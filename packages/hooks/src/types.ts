export interface Paginated<T> {
  items: T[]
  total: number
  truncated: boolean
}

export interface SphereScopedFilter {
  sphere?: string
}

export interface MutationResult<TArgs, TResult = void> {
  mutate: (args: TArgs) => Promise<TResult>
  isPending: boolean
  error: Error | undefined
}
