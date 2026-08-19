import type { PalimpsestStore, ProjectionState } from '@alnorth/palimpsest'
import { updateTask } from '@alnorth/palimpsest'
import { requireTask } from './internal/requireTask'
import { useMutation } from './internal/useMutation'
import type { MutationResult } from './types'

export interface SetStarredArgs {
  taskId: string
  starred: boolean
}

// Module-level (not a closure created per render/hook-instance) so useMutation's internal
// useCallback([store, projState, fn]) only recomputes `mutate` when store/projState actually
// change, instead of on every render.
async function runSetStarred(store: PalimpsestStore, projState: ProjectionState, args: SetStarredArgs): Promise<void> {
  const task = requireTask(projState, args.taskId)
  await store.appendEvents(updateTask(task, { isStarred: args.starred }))
}

export function useSetStarred(): MutationResult<SetStarredArgs, void> {
  return useMutation(runSetStarred)
}
