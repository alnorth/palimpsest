import { describe, test, expect } from 'vitest'
import { createEmptyState } from 'palimpsest'
import type { Task, ProjectionState, Project, Agenda, Context, TaskId, ProjectId, SphereId, AgendaId, ContextId } from 'palimpsest'
import { getTaskRowMeta, getTaskDetailFields, formatDateTime } from './taskMeta.js'

const TODAY = '2026-06-30'
const PAST = '2026-01-01'
const FUTURE = '2026-12-25'

const BASE_TASK: Task = {
  id: 'task1' as TaskId,
  title: 'Test task',
  description: '',
  status: 'open',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sphereId: 'sph1' as SphereId,
}

function makeTask(overrides: Partial<Task>): Task {
  return { ...BASE_TASK, ...overrides }
}

function stateWithProject(id: ProjectId, name: string): ProjectionState {
  const state = createEmptyState()
  const project: Project = { id, sphereId: 'sph1' as SphereId, name, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
  state.projects.set(id, project)
  return state
}

function stateWithAgenda(id: AgendaId, title: string): ProjectionState {
  const state = createEmptyState()
  const agenda: Agenda = { id, sphereId: 'sph1' as SphereId, title }
  state.agendas.set(id, agenda)
  return state
}

function stateWithContext(id: ContextId, name: string): ProjectionState {
  const state = createEmptyState()
  const context: Context = { id, sphereId: 'sph1' as SphereId, name }
  state.contexts.set(id, context)
  return state
}

describe('formatDateTime', () => {
  test('formats a datetime string as "D Mon HH:MM"', () => {
    const result = formatDateTime('2026-06-30T09:05:00.000Z')
    expect(result).toMatch(/30 Jun/)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('getTaskRowMeta', () => {
  test('returns empty array for task with no meta fields', () => {
    expect(getTaskRowMeta(makeTask({}), createEmptyState(), { today: TODAY })).toEqual([])
  })

  test('description returns ¶ item', () => {
    const items = getTaskRowMeta(makeTask({ description: 'notes' }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: '¶' })
  })

  test('empty description returns no ¶ item', () => {
    const items = getTaskRowMeta(makeTask({ description: '' }), createEmptyState(), { today: TODAY })
    expect(items.map(i => i.text)).not.toContain('¶')
  })

  test('waitingFor review returns "w/ review"', () => {
    const items = getTaskRowMeta(makeTask({ waitingFor: { kind: 'review' } }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: 'w/ review' })
  })

  test('waitingFor trello returns "w/ Trello"', () => {
    const items = getTaskRowMeta(makeTask({ waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: 'w/ Trello' })
  })

  test('waitingFor agenda returns "w/ @AgendaName"', () => {
    const agendaId = 'ag1' as AgendaId
    const state = stateWithAgenda(agendaId, 'Boss')
    const items = getTaskRowMeta(makeTask({ waitingFor: { kind: 'agenda', agendaId } }), state, { today: TODAY })
    expect(items).toContainEqual({ text: 'w/ @Boss' })
  })

  test('waitingFor project returns "w/ #ProjectName"', () => {
    const projectId = 'proj1' as ProjectId
    const state = stateWithProject(projectId, 'Website')
    const items = getTaskRowMeta(makeTask({ waitingFor: { kind: 'project', projectId } }), state, { today: TODAY })
    expect(items).toContainEqual({ text: 'w/ #Website' })
  })

  test('showProject=true and task has projectId returns project name item', () => {
    const projectId = 'proj1' as ProjectId
    const state = stateWithProject(projectId, 'Work')
    const items = getTaskRowMeta(makeTask({ projectId }), state, { showProject: true, today: TODAY })
    expect(items).toContainEqual({ text: '#Work' })
  })

  test('showProject=false hides project name', () => {
    const projectId = 'proj1' as ProjectId
    const state = stateWithProject(projectId, 'Work')
    const items = getTaskRowMeta(makeTask({ projectId }), state, { showProject: false, today: TODAY })
    expect(items.map(i => i.text)).not.toContain('#Work')
  })

  test('dueDate in the past → dueStatus: "overdue"', () => {
    const items = getTaskRowMeta(makeTask({ dueDate: PAST }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: PAST, dueStatus: 'overdue' })
  })

  test('dueDate equal to today → dueStatus: "today"', () => {
    const items = getTaskRowMeta(makeTask({ dueDate: TODAY }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: TODAY, dueStatus: 'today' })
  })

  test('dueDate in the future → no dueStatus', () => {
    const items = getTaskRowMeta(makeTask({ dueDate: FUTURE }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: FUTURE })
    expect(items.find(i => i.text === FUTURE)?.dueStatus).toBeUndefined()
  })

  test('dueDateExpression returns "↻ <expr>" item', () => {
    const items = getTaskRowMeta(makeTask({ dueDateExpression: 'weekly' }), createEmptyState(), { today: TODAY })
    expect(items).toContainEqual({ text: '↻ weekly' })
  })

  test('completedAt returns a formatted datetime item', () => {
    const items = getTaskRowMeta(makeTask({ completedAt: '2026-06-30T09:05:00.000Z' }), createEmptyState(), { today: TODAY })
    expect(items.length).toBe(1)
    expect(items[0]?.text).toMatch(/30 Jun/)
  })

  test('agendaId returns "@AgendaTitle" item', () => {
    const agendaId = 'ag1' as AgendaId
    const state = stateWithAgenda(agendaId, 'Manager 1:1')
    const items = getTaskRowMeta(makeTask({ agendaId }), state, { today: TODAY })
    expect(items).toContainEqual({ text: '@Manager 1:1' })
  })

  test('contextId returns "$ContextName" item', () => {
    const contextId = 'ctx1' as ContextId
    const state = stateWithContext(contextId, 'Home')
    const items = getTaskRowMeta(makeTask({ contextId }), state, { today: TODAY })
    expect(items).toContainEqual({ text: '$Home' })
  })
})

describe('getTaskDetailFields', () => {
  test('returns empty array for bare task', () => {
    expect(getTaskDetailFields(makeTask({}), createEmptyState())).toEqual([])
  })

  test('project field shows "#ProjectName"', () => {
    const projectId = 'proj1' as ProjectId
    const state = stateWithProject(projectId, 'Launch')
    const fields = getTaskDetailFields(makeTask({ projectId }), state)
    const field = fields.find(f => f.value === '#Launch')
    expect(field).toBeDefined()
    expect(field?.label).toContain('project')
  })

  test('agenda field shows "@AgendaTitle"', () => {
    const agendaId = 'ag1' as AgendaId
    const state = stateWithAgenda(agendaId, 'Standup')
    const fields = getTaskDetailFields(makeTask({ agendaId }), state)
    expect(fields.find(f => f.value === '@Standup')).toBeDefined()
  })

  test('context field shows "$ContextName"', () => {
    const contextId = 'ctx1' as ContextId
    const state = stateWithContext(contextId, 'Office')
    const fields = getTaskDetailFields(makeTask({ contextId }), state)
    expect(fields.find(f => f.value === '$Office')).toBeDefined()
  })

  test('isNext:true adds "next action" field', () => {
    const fields = getTaskDetailFields(makeTask({ isNext: true }), createEmptyState())
    expect(fields.find(f => f.label === 'next action')).toBeDefined()
  })

  test('isStarred:true adds "starred" field', () => {
    const fields = getTaskDetailFields(makeTask({ isStarred: true }), createEmptyState())
    expect(fields.find(f => f.label === 'starred')).toBeDefined()
  })

  test('trello waitingFor adds field with cardUrl as href', () => {
    const cardUrl = 'https://trello.com/c/abc123'
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'trello', cardUrl } }), createEmptyState())
    const field = fields.find(f => f.label.includes('waiting'))
    expect(field?.value).toBe(cardUrl)
    expect(field?.href).toBe(cardUrl)
  })

  test('review waitingFor adds "for review" field', () => {
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'review' } }), createEmptyState())
    const field = fields.find(f => f.label.includes('waiting'))
    expect(field?.value).toBe('for review')
    expect(field?.href).toBeUndefined()
  })

  test('dueDate adds due field', () => {
    const fields = getTaskDetailFields(makeTask({ dueDate: FUTURE }), createEmptyState())
    expect(fields.find(f => f.label.includes('due') && f.value === FUTURE)).toBeDefined()
  })

  test('dueDateExpression adds recurring field', () => {
    const fields = getTaskDetailFields(makeTask({ dueDateExpression: 'monthly' }), createEmptyState())
    expect(fields.find(f => f.label.includes('recurring') && f.value.includes('monthly'))).toBeDefined()
  })
})
