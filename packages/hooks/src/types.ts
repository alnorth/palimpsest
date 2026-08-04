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
