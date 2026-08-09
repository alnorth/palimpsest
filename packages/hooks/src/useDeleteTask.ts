import type { PalimpsestStore, ProjectionState } from '@alnorth/palimpsest'
import { deleteTask } from '@alnorth/palimpsest'
import { requireTask } from './internal/requireTask'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runDeleteTask(store: PalimpsestStore, projState: ProjectionState, taskId: string): Promise<void> {
  const task = requireTask(projState, taskId)
  await store.appendEvents(deleteTask(task))
}

export function useDeleteTask(): MutationResult<string, void> {
  return useMutation(runDeleteTask)
}
