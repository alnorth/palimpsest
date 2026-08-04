export interface QueryResult<T> {
  data: T | undefined
  isLoading: boolean
  error: Error | undefined
}

export interface ListResult<T> extends QueryResult<T[]> {
  total: number | undefined
  truncated: boolean | undefined
}

export interface SphereScopedFilter {
  sphere?: string
}

export interface MutationResult<TArgs, TResult = void> {
  mutate: (args: TArgs) => Promise<TResult>
  isPending: boolean
  error: Error | undefined
}
