import type { TaskJson } from 'palimpsest-query'
import { MONTHS } from './previews.js'

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

export type DueStatus = 'overdue' | 'today' | 'future'

export function getDueStatus(dueDate: string | null, today?: string): DueStatus | undefined {
  if (dueDate === null) return undefined
  const t = today ?? localToday()
  if (dueDate < t) return 'overdue'
  if (dueDate === t) return 'today'
  return 'future'
}

export function hasDescription(task: TaskJson): boolean {
  return task.description.trim() !== ''
}

export type TaskBadgeKind =
  | 'description' | 'waiting' | 'project' | 'agenda' | 'context' | 'dueDate' | 'recurrence' | 'completedAt'

export interface TaskBadge {
  kind: TaskBadgeKind
  text: string
  dueStatus?: DueStatus
}

export interface TaskDetailField {
  label: string
  value: string
  href?: string
}

function waitingBadgeText(waitingFor: NonNullable<TaskJson['waitingFor']>): string {
  if (waitingFor.kind === 'review') return 'w/ review'
  if (waitingFor.kind === 'trello') return 'w/ Trello'
  return `w/ ${waitingFor.name}`
}

export function getTaskBadges(task: TaskJson, opts?: { showProject?: boolean; today?: string }): TaskBadge[] {
  const badges: TaskBadge[] = []

  if (hasDescription(task)) badges.push({ kind: 'description', text: '¶' })
  if (task.waitingFor !== null) badges.push({ kind: 'waiting', text: waitingBadgeText(task.waitingFor) })
  if (opts?.showProject === true && task.project !== null) badges.push({ kind: 'project', text: task.project.name })
  if (task.agenda !== null) badges.push({ kind: 'agenda', text: task.agenda.name })
  if (task.context !== null) badges.push({ kind: 'context', text: task.context.name })
  if (task.dueDate !== null) {
    const dueStatus = getDueStatus(task.dueDate, opts?.today)
    badges.push({ kind: 'dueDate', text: task.dueDate, ...(dueStatus !== undefined && { dueStatus }) })
  }
  if (task.recurrence !== null) badges.push({ kind: 'recurrence', text: task.recurrence })
  if (task.completedAt !== null) badges.push({ kind: 'completedAt', text: formatDateTime(task.completedAt) })

  return badges
}

export function getTaskDetailFields(task: TaskJson): TaskDetailField[] {
  const fields: TaskDetailField[] = []

  if (task.project !== null) fields.push({ label: 'project', value: task.project.name })
  if (task.agenda !== null) fields.push({ label: 'agenda', value: task.agenda.name })
  if (task.context !== null) fields.push({ label: 'context', value: task.context.name })
  if (task.dueDate !== null) fields.push({ label: 'due', value: task.dueDate })
  if (task.recurrence !== null) fields.push({ label: 'recurring', value: task.recurrence })
  if (task.completedAt !== null) fields.push({ label: 'completed', value: formatDateTime(task.completedAt) })
  if (task.isNext) fields.push({ label: 'next action', value: '' })
  if (task.isStarred) fields.push({ label: 'starred', value: '' })
  if (task.waitingFor !== null) {
    const wf = task.waitingFor
    const value = wf.kind === 'review' ? 'for review' : wf.kind === 'trello' ? wf.cardUrl : wf.name
    const href = wf.kind === 'trello' ? wf.cardUrl : undefined
    fields.push({ label: 'waiting', value, ...(href !== undefined && { href }) })
  }

  return fields
}
