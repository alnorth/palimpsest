import type { AgendaId, ContextId, WaitingFor } from 'palimpsest'
import { AGENDA_ID_TO_LABEL, CONTEXT_ID_TO_LABEL } from './mapping.js'

interface TaskLabelFields {
  isNext?: true
  agendaId?: AgendaId
  contextId?: ContextId
  waitingFor?: WaitingFor
}

// Compute the full Todoist label set for a task's current state.
// Sphere labels ('work' / 'personal') are NOT included here — they are only
// applied to tasks written to the Recurring project, which we don't do.
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
  if (contextLabel !== undefined) labels.push(contextLabel)

  return labels
}
