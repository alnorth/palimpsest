import type { AgendaId, ContextId, WaitingFor } from 'palimpsest'
import { AGENDA_ID_TO_LABEL, CONTEXT_ID_TO_LABEL } from './mapping.js'

interface TaskLabelFields {
  isNext?: true | undefined
  agendaId?: AgendaId | undefined
  contextId?: ContextId | undefined
  waitingFor?: WaitingFor | undefined
}

// Compute the full Todoist label set for a task's current state.
// Sphere labels ('work' / 'personal') are NOT included — callers that write
// free-floating tasks must add the sphere label separately if needed.
export function computeLabels(task: TaskLabelFields): string[] {
  const labels: string[] = []

  if (task.isNext === true) labels.push('next')

  const agendaLabel = task.agendaId !== undefined ? AGENDA_ID_TO_LABEL[task.agendaId] : undefined
  if (agendaLabel !== undefined) labels.push(agendaLabel)

  if (task.waitingFor !== undefined) {
    labels.push('waiting')
    if (task.waitingFor.kind === 'review') {
      labels.push('nonagenda')
    } else if (task.waitingFor.kind === 'agenda') {
      const wfLabel = AGENDA_ID_TO_LABEL[task.waitingFor.agendaId]
      // Only add if not already present (agendaId and waitingFor.agenda can share the same label)
      if (wfLabel !== undefined && !labels.includes(wfLabel)) labels.push(wfLabel)
    } else if (task.waitingFor.kind === 'project') {
      labels.push('project')
    } else if (task.waitingFor.kind === 'trello') {
      labels.push('trello')
    }
  }

  const contextLabel = task.contextId !== undefined ? CONTEXT_ID_TO_LABEL[task.contextId] : undefined
  if (contextLabel !== undefined) {
    labels.push(contextLabel)
    if (HOME_CONTEXTS.has(contextLabel))  labels.push('home')
    if (ADMIN_CONTEXTS.has(contextLabel)) labels.push('admin')
  }

  return labels
}

const HOME_CONTEXTS  = new Set(['tools', 'sewing', 'notools', 'loft'])
const ADMIN_CONTEXTS = new Set(['phone', 'laptop', 'deepthought'])
