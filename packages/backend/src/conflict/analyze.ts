import type { PalimpsestEvent } from 'palimpsest'

export type ConflictResult =
  | { status: 'ok'; idempotent?: boolean }
  | { status: 'conflict'; reason: ConflictReason; conflictingEvents: PalimpsestEvent[] }

export type ConflictReason =
  | 'task-deleted'
  | 'task-already-completed'
  | 'parent-deleted'
  | 'concurrent-update'

// Extract the primary entity ID from an event
function entityId(event: PalimpsestEvent): string | undefined {
  const e = event as unknown as Record<string, unknown>
  return (
    e['taskId'] ?? e['projectId'] ?? e['sphereId'] ?? e['agendaId'] ?? e['contextId']
  ) as string | undefined
}

// Build lookup sets from intervening events for O(1) checks
interface InterveningIndex {
  deletedTasks: Set<string>
  completedTasks: Set<string>  // completed or recurred (closed state)
  uncompletedTasks: Set<string>
  deletedTasks2: Set<string>
  deletedProjects: Set<string>
}

function indexIntervening(intervening: PalimpsestEvent[]): InterveningIndex {
  const idx: InterveningIndex = {
    deletedTasks: new Set(),
    completedTasks: new Set(),
    uncompletedTasks: new Set(),
    deletedTasks2: new Set(),
    deletedProjects: new Set(),
  }
  for (const ev of intervening) {
    const e = ev as unknown as Record<string, unknown>
    const tid = e['taskId'] as string | undefined
    const pid = e['projectId'] as string | undefined
    switch (ev.type) {
      case 'task.deleted':   if (tid) idx.deletedTasks.add(tid); break
      case 'task.completed': if (tid) idx.completedTasks.add(tid); break
      case 'task.recurred':  if (tid) idx.completedTasks.add(tid); break
      case 'task.uncompleted': if (tid) idx.uncompletedTasks.add(tid); break
      case 'project.deleted': if (pid) idx.deletedProjects.add(pid); break
    }
  }
  return idx
}

function analyzeOne(
  submitted: PalimpsestEvent,
  idx: InterveningIndex,
  intervening: PalimpsestEvent[],
): ConflictResult {
  const e = submitted as unknown as Record<string, unknown>
  const tid = e['taskId'] as string | undefined
  const sid = e['sphereId'] as string | undefined
  const pid = e['projectId'] as string | undefined

  switch (submitted.type) {
    case 'task.updated': {
      if (tid && idx.deletedTasks.has(tid)) {
        return { status: 'conflict', reason: 'task-deleted', conflictingEvents: intervening.filter(ev => (ev as any).taskId === tid && ev.type === 'task.deleted') }
      }
      if (tid && idx.completedTasks.has(tid)) {
        return { status: 'conflict', reason: 'task-already-completed', conflictingEvents: intervening.filter(ev => (ev as any).taskId === tid && (ev.type === 'task.completed' || ev.type === 'task.recurred')) }
      }
      return { status: 'ok' }
    }

    case 'task.completed': {
      if (tid && idx.deletedTasks.has(tid)) {
        return { status: 'conflict', reason: 'task-deleted', conflictingEvents: intervening.filter(ev => (ev as any).taskId === tid && ev.type === 'task.deleted') }
      }
      if (tid && idx.completedTasks.has(tid)) {
        return { status: 'ok', idempotent: true }
      }
      return { status: 'ok' }
    }

    case 'task.uncompleted': {
      if (tid && idx.uncompletedTasks.has(tid)) {
        return { status: 'ok', idempotent: true }
      }
      return { status: 'ok' }
    }

    case 'task.deleted': {
      if (tid && idx.deletedTasks.has(tid)) {
        return { status: 'ok', idempotent: true }
      }
      return { status: 'ok' }
    }

    case 'task.created': {
      if (pid && idx.deletedProjects.has(pid)) {
        return { status: 'conflict', reason: 'parent-deleted', conflictingEvents: intervening.filter(ev => (ev as any).projectId === pid && ev.type === 'project.deleted') }
      }
      return { status: 'ok' }
    }

    case 'task.recurred': {
      if (tid && idx.deletedTasks.has(tid)) {
        return { status: 'conflict', reason: 'task-deleted', conflictingEvents: intervening.filter(ev => (ev as any).taskId === tid && ev.type === 'task.deleted') }
      }
      return { status: 'ok' }
    }

    // Project events
    case 'project.updated':
    case 'project.deleted':
    case 'project.archived':
    case 'project.unarchived': {
      // These don't overlap with the indices above in a hard-conflict way
      return { status: 'ok' }
    }

    case 'project.created':
      return { status: 'ok' }

    default:
      return { status: 'ok' }
  }
}

export function analyzeConflict(
  submitted: PalimpsestEvent[],
  intervening: PalimpsestEvent[],
): ConflictResult {
  const idx = indexIntervening(intervening)

  for (const event of submitted) {
    const result = analyzeOne(event, idx, intervening)
    if (result.status === 'conflict') return result
  }

  // Check if all submitted events are idempotent
  const allIdempotent = submitted.every(event => {
    const r = analyzeOne(event, idx, intervening)
    return r.status === 'ok' && r.idempotent === true
  })

  return allIdempotent ? { status: 'ok', idempotent: true } : { status: 'ok' }
}
