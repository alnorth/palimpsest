import { useCallback, useState } from 'react'
import type { PalimpsestStore, ProjectionState } from '@alnorth/palimpsest'
import { usePalimpsestContext } from '../PalimpsestProvider'
import type { MutationResult } from '../types'

export function useMutation<TArgs, TResult>(
  fn: (store: PalimpsestStore, projState: ProjectionState, args: TArgs) => Promise<TResult>,
): MutationResult<TArgs, TResult> {
  const { store, projState } = usePalimpsestContext()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)

  const mutate = useCallback(async (args: TArgs): Promise<TResult> => {
    setError(undefined)
    if (projState === undefined) {
      const notReady = new Error('Palimpsest data is not loaded yet')
      setError(notReady)
      throw notReady
    }
    setIsPending(true)
    try {
      const result = await fn(store, projState, args)
      setIsPending(false)
      return result
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err))
      setError(asError)
      setIsPending(false)
      throw asError
    }
  }, [store, projState, fn])

  return { mutate, isPending, error }
}
