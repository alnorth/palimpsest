import { describe, test, expect } from 'vitest'
import type { TaskJson } from 'palimpsest-query'
import { getDueStatus, hasDescription, getTaskBadges, getTaskDetailFields, formatDateTime } from './taskDisplay.js'

const TODAY = '2026-06-30'
const PAST = '2026-01-01'
const FUTURE = '2026-12-25'

const BASE_TASK: TaskJson = {
  id: 'task1',
  title: 'Test task',
  description: '',
  status: 'open',
  sphere: null,
  project: null,
  agenda: null,
  context: null,
  dueDate: null,
  recurrence: null,
  isNext: false,
  isStarred: false,
  waitingFor: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
}

function makeTask(overrides: Partial<TaskJson>): TaskJson {
  return { ...BASE_TASK, ...overrides }
}

describe('formatDateTime', () => {
  test('formats a datetime string as "D Mon HH:MM"', () => {
    const result = formatDateTime('2026-06-30T09:05:00.000Z')
    expect(result).toMatch(/30 Jun/)
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('getDueStatus', () => {
  test('returns undefined for a null due date', () => {
    expect(getDueStatus(null, TODAY)).toBeUndefined()
  })

  test('returns "overdue" for a past date', () => {
    expect(getDueStatus(PAST, TODAY)).toBe('overdue')
  })

  test('returns "today" for the given today', () => {
    expect(getDueStatus(TODAY, TODAY)).toBe('today')
  })

  test('returns "future" for a date after today', () => {
    expect(getDueStatus(FUTURE, TODAY)).toBe('future')
  })
})

describe('hasDescription', () => {
  test('false for empty description', () => {
    expect(hasDescription(makeTask({ description: '' }))).toBe(false)
  })

  test('true for non-empty description', () => {
    expect(hasDescription(makeTask({ description: 'notes' }))).toBe(true)
  })
})

describe('getTaskBadges', () => {
  test('returns empty array for a task with no meta fields', () => {
    expect(getTaskBadges(makeTask({}), { today: TODAY })).toEqual([])
  })

  test('description badge', () => {
    const badges = getTaskBadges(makeTask({ description: 'notes' }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'description', text: '¶' })
  })

  test('waitingFor review badge', () => {
    const badges = getTaskBadges(makeTask({ waitingFor: { kind: 'review' } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'waiting', text: 'w/ review' })
  })

  test('waitingFor trello badge', () => {
    const badges = getTaskBadges(makeTask({ waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'waiting', text: 'w/ Trello' })
  })

  test('waitingFor agenda badge uses the resolved name', () => {
    const badges = getTaskBadges(makeTask({ waitingFor: { kind: 'agenda', id: 'a1', name: 'Boss' } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'waiting', text: 'w/ Boss' })
  })

  test('waitingFor agenda badge falls back to a "?" placeholder when the agenda is dangling', () => {
    const badges = getTaskBadges(makeTask({ waitingFor: { kind: 'agenda', id: 'a1', name: null } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'waiting', text: 'w/ ?' })
  })

  test('waitingFor project badge falls back to a "?" placeholder when the project is dangling', () => {
    const badges = getTaskBadges(makeTask({ waitingFor: { kind: 'project', id: 'p1', name: null } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'waiting', text: 'w/ ?' })
  })

  test('project badge only shown when showProject is true', () => {
    const task = makeTask({ project: { id: 'p1', name: 'Work' } })
    expect(getTaskBadges(task, { today: TODAY })).not.toContainEqual(expect.objectContaining({ kind: 'project' }))
    expect(getTaskBadges(task, { showProject: true, today: TODAY })).toContainEqual({ kind: 'project', text: 'Work' })
  })

  test('agenda badge', () => {
    const badges = getTaskBadges(makeTask({ agenda: { id: 'a1', name: 'Standup' } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'agenda', text: 'Standup' })
  })

  test('context badge', () => {
    const badges = getTaskBadges(makeTask({ context: { id: 'c1', name: 'Home' } }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'context', text: 'Home' })
  })

  test('dueDate badge carries dueStatus', () => {
    const badges = getTaskBadges(makeTask({ dueDate: PAST }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'dueDate', text: PAST, dueStatus: 'overdue' })
  })

  test('recurrence badge', () => {
    const badges = getTaskBadges(makeTask({ recurrence: 'weekly' }), { today: TODAY })
    expect(badges).toContainEqual({ kind: 'recurrence', text: 'weekly' })
  })

  test('completedAt badge is a formatted datetime', () => {
    const badges = getTaskBadges(makeTask({ completedAt: '2026-06-30T09:05:00.000Z' }), { today: TODAY })
    const badge = badges.find(b => b.kind === 'completedAt')
    expect(badge?.text).toMatch(/30 Jun/)
  })
})

describe('getTaskDetailFields', () => {
  test('returns empty array for a bare task', () => {
    expect(getTaskDetailFields(makeTask({}))).toEqual([])
  })

  test('project field', () => {
    const fields = getTaskDetailFields(makeTask({ project: { id: 'p1', name: 'Launch' } }))
    expect(fields).toContainEqual({ label: 'project', value: 'Launch' })
  })

  test('agenda field', () => {
    const fields = getTaskDetailFields(makeTask({ agenda: { id: 'a1', name: 'Standup' } }))
    expect(fields).toContainEqual({ label: 'agenda', value: 'Standup' })
  })

  test('context field', () => {
    const fields = getTaskDetailFields(makeTask({ context: { id: 'c1', name: 'Office' } }))
    expect(fields).toContainEqual({ label: 'context', value: 'Office' })
  })

  test('isNext adds a "next action" field', () => {
    const fields = getTaskDetailFields(makeTask({ isNext: true }))
    expect(fields.find(f => f.label === 'next action')).toBeDefined()
  })

  test('isStarred adds a "starred" field', () => {
    const fields = getTaskDetailFields(makeTask({ isStarred: true }))
    expect(fields.find(f => f.label === 'starred')).toBeDefined()
  })

  test('trello waitingFor adds a field with the card url as both value and href', () => {
    const cardUrl = 'https://trello.com/c/abc123'
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'trello', cardUrl } }))
    const field = fields.find(f => f.label === 'waiting')
    expect(field?.value).toBe(cardUrl)
    expect(field?.href).toBe(cardUrl)
  })

  test('review waitingFor adds a "for review" field with no href', () => {
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'review' } }))
    const field = fields.find(f => f.label === 'waiting')
    expect(field?.value).toBe('for review')
    expect(field?.href).toBeUndefined()
  })

  test('agenda waitingFor with a dangling reference shows a "?" placeholder', () => {
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'agenda', id: 'a1', name: null } }))
    const field = fields.find(f => f.label === 'waiting')
    expect(field?.value).toBe('?')
    expect(field?.href).toBeUndefined()
  })

  test('project waitingFor with a dangling reference shows a "?" placeholder', () => {
    const fields = getTaskDetailFields(makeTask({ waitingFor: { kind: 'project', id: 'p1', name: null } }))
    const field = fields.find(f => f.label === 'waiting')
    expect(field?.value).toBe('?')
  })

  test('dueDate adds a due field', () => {
    const fields = getTaskDetailFields(makeTask({ dueDate: FUTURE }))
    expect(fields).toContainEqual({ label: 'due', value: FUTURE })
  })

  test('recurrence adds a recurring field', () => {
    const fields = getTaskDetailFields(makeTask({ recurrence: 'monthly' }))
    expect(fields).toContainEqual({ label: 'recurring', value: 'monthly' })
  })
})
