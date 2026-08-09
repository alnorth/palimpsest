import type { PalimpsestStore, ProjectionState } from '@alnorth/palimpsest'
import { CLEAR, updateTask } from '@alnorth/palimpsest'
import { requireTask } from './internal/requireTask'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export interface SetDueDateArgs {
  taskId: string
  dueDate: string | null
}

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runSetDueDate(store: PalimpsestStore, projState: ProjectionState, args: SetDueDateArgs): Promise<void> {
  const task = requireTask(projState, args.taskId)
  await store.appendEvents(updateTask(task, { dueDate: args.dueDate === null ? CLEAR : args.dueDate }))
}

export function useSetDueDate(): MutationResult<SetDueDateArgs, void> {
  return useMutation(runSetDueDate)
}
