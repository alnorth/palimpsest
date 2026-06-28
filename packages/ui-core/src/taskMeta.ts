import type { Task, ProjectionState } from 'palimpsest'
import { getProject, getAgenda, getContext } from 'palimpsest'
import { AGENDA_PREFIX, PROJECT_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from './prefixes.js'
import { MONTHS } from './previews.js'

export interface TaskMetaItem {
  text: string
  dueStatus?: 'today' | 'overdue'
}

export interface TaskDetailField {
  label: string
  value: string
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${h}:${m}`
}

type ResolvedWaiting = { kind: 'review' } | { kind: 'agenda' | 'project'; name: string }

function resolveWaiting(task: Task, state: ProjectionState): ResolvedWaiting | undefined {
  const wf = task.waitingFor
  if (wf === undefined) return undefined
  if (wf.kind === 'review') return { kind: 'review' }
  if (wf.kind === 'agenda') {
    const a = getAgenda(state, wf.agendaId)
    return { kind: 'agenda', name: a !== undefined ? `${AGENDA_PREFIX}${a.title}` : `${AGENDA_PREFIX}?` }
  }
  const p = getProject(state, wf.projectId)
  return { kind: 'project', name: p !== undefined ? `${PROJECT_PREFIX}${p.name}` : `${PROJECT_PREFIX}?` }
}

export function getTaskRowMeta(
  task: Task,
  state: ProjectionState,
  opts?: { showProject?: boolean }
): TaskMetaItem[] {
  const items: TaskMetaItem[] = []
  if (task.description) items.push({ text: '¶' })
  const wf = resolveWaiting(task, state)
  if (wf !== undefined) {
    items.push({ text: wf.kind === 'review' ? 'w/ review' : `w/ ${wf.name}` })
  }
  if (opts?.showProject === true && task.projectId !== undefined) {
    const p = getProject(state, task.projectId)
    if (p !== undefined) items.push({ text: `${PROJECT_PREFIX}${p.name}` })
  }
  if (task.agendaId !== undefined) {
    const a = getAgenda(state, task.agendaId)
    if (a !== undefined) items.push({ text: `${AGENDA_PREFIX}${a.title}` })
  }
  if (task.contextId !== undefined) {
    const c = getContext(state, task.contextId)
    if (c !== undefined) items.push({ text: `${CONTEXT_PREFIX}${c.name}` })
  }
  if (task.dueDate !== undefined) {
    const today = localToday()
    const dueStatus = task.dueDate === today ? 'today' as const : task.dueDate < today ? 'overdue' as const : undefined
    items.push({ text: task.dueDate, ...(dueStatus !== undefined && { dueStatus }) })
  }
  if (task.dueDateExpression !== undefined) {
    items.push({ text: `${RECURRENCE_PREFIX} ${task.dueDateExpression}` })
  }
  if (task.completedAt !== undefined) {
    items.push({ text: formatDateTime(task.completedAt) })
  }
  return items
}

export function getTaskDetailFields(task: Task, state: ProjectionState): TaskDetailField[] {
  const fields: TaskDetailField[] = []
  if (task.projectId !== undefined) {
    const p = getProject(state, task.projectId)
    if (p !== undefined) fields.push({ label: 'project    ', value: `${PROJECT_PREFIX}${p.name}` })
  }
  if (task.agendaId !== undefined) {
    const a = getAgenda(state, task.agendaId)
    if (a !== undefined) fields.push({ label: 'agenda     ', value: `${AGENDA_PREFIX}${a.title}` })
  }
  if (task.contextId !== undefined) {
    const c = getContext(state, task.contextId)
    if (c !== undefined) fields.push({ label: 'context    ', value: `${CONTEXT_PREFIX}${c.name}` })
  }
  if (task.dueDate !== undefined) {
    fields.push({ label: 'due        ', value: task.dueDate })
  }
  if (task.dueDateExpression !== undefined) {
    fields.push({ label: 'recurring  ', value: `${RECURRENCE_PREFIX} ${task.dueDateExpression}` })
  }
  if (task.completedAt !== undefined) {
    fields.push({ label: 'completed  ', value: formatDateTime(task.completedAt) })
  }
  if (task.isNext === true) {
    fields.push({ label: 'next action', value: '' })
  }
  if (task.isStarred === true) {
    fields.push({ label: 'starred', value: '' })
  }
  const wf = resolveWaiting(task, state)
  if (wf !== undefined) {
    fields.push({ label: 'waiting    ', value: wf.kind === 'review' ? 'for review' : wf.name })
  }
  return fields
}
