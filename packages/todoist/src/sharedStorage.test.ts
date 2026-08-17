import { describe, it, expect } from 'vitest'
import {
  AGENDA_PROJECT_MAP_TASK_TITLE,
  DASHBOARD_STORAGE_TASK_TITLES,
  SELF_AGENDA_LABEL,
  findAgendaMapTask,
  parseAgendaMapping,
  serializeAgendaMapping,
  resolveProjectSharing,
  labelForAgenda,
} from './sharedStorage'
import type { SyncItem } from './api'
import type { AgendaId } from '@alnorth/palimpsest'

function makeMapTask(overrides: Partial<SyncItem> = {}): SyncItem {
  return {
    id: 'maptask1',
    content: AGENDA_PROJECT_MAP_TASK_TITLE,
    description: '',
    project_id: '6JHvGw2XGX8wPQR5',
    parent_id: null,
    labels: [],
    priority: 1,
    due: null,
    checked: false,
    is_deleted: false,
    added_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

function makeOtherTask(overrides: Partial<SyncItem> = {}): SyncItem {
  return makeMapTask({ id: 'other1', content: 'Buy milk', ...overrides })
}

describe('findAgendaMapTask', () => {
  it('finds the task by exact content match', () => {
    const task = makeMapTask()
    expect(findAgendaMapTask([makeOtherTask(), task])).toBe(task)
  })

  it('returns undefined when no task matches', () => {
    expect(findAgendaMapTask([makeOtherTask()])).toBeUndefined()
  })

  it('ignores a deleted task even if content matches', () => {
    const task = makeMapTask({ is_deleted: true })
    expect(findAgendaMapTask([task])).toBeUndefined()
  })
})

describe('parseAgendaMapping', () => {
  it('returns {} when the task is undefined', () => {
    expect(parseAgendaMapping(undefined)).toEqual({})
  })

  it('parses a valid fenced JSON mapping', () => {
    const task = makeMapTask({ description: '```\n{\n  "proj1": "jim"\n}\n```' })
    expect(parseAgendaMapping(task)).toEqual({ proj1: 'jim' })
  })

  it('returns {} for malformed JSON', () => {
    const task = makeMapTask({ description: '```\nnot json\n```' })
    expect(parseAgendaMapping(task)).toEqual({})
  })

  it('returns {} when the parsed JSON is not an object', () => {
    const task = makeMapTask({ description: '```\n"just a string"\n```' })
    expect(parseAgendaMapping(task)).toEqual({})
  })
})

describe('serializeAgendaMapping', () => {
  it('round-trips through parseAgendaMapping', () => {
    const mapping = { proj1: 'jim', proj2: 'me' }
    const description = serializeAgendaMapping(mapping)
    const task = makeMapTask({ description })
    expect(parseAgendaMapping(task)).toEqual(mapping)
  })

  it('fences the JSON in triple backticks', () => {
    const description = serializeAgendaMapping({ proj1: 'jim' })
    expect(description.startsWith('```\n')).toBe(true)
    expect(description.endsWith('\n```')).toBe(true)
  })
})

describe('resolveProjectSharing', () => {
  it('translates a recognized label into agendaIds, not selfOnlyProjectIds', () => {
    const { agendaIds, selfOnlyProjectIds } = resolveProjectSharing({ proj1: 'jim' })
    expect(agendaIds).toEqual({ proj1: 'agenda-jim' as AgendaId })
    expect(selfOnlyProjectIds.size).toBe(0)
  })

  it('SELF_AGENDA_LABEL ("me") lands in selfOnlyProjectIds, not agendaIds', () => {
    const { agendaIds, selfOnlyProjectIds } = resolveProjectSharing({ proj1: SELF_AGENDA_LABEL })
    expect(agendaIds).toEqual({})
    expect(selfOnlyProjectIds.has('proj1')).toBe(true)
  })

  it('drops a genuinely unrecognized/typo label from both outcomes', () => {
    const { agendaIds, selfOnlyProjectIds } = resolveProjectSharing({ proj1: 'not-a-real-label' })
    expect(agendaIds).toEqual({})
    expect(selfOnlyProjectIds.size).toBe(0)
  })

  it('resolves multiple entries, mixing recognized, self, and unrecognized labels', () => {
    const { agendaIds, selfOnlyProjectIds } = resolveProjectSharing({
      proj1: 'jim',
      proj2: SELF_AGENDA_LABEL,
      proj3: 'han',
      proj4: 'bogus',
    })
    expect(agendaIds).toEqual({ proj1: 'agenda-jim' as AgendaId, proj3: 'agenda-han' as AgendaId })
    expect(selfOnlyProjectIds).toEqual(new Set(['proj2']))
  })
})

describe('DASHBOARD_STORAGE_TASK_TITLES', () => {
  it('includes the agenda-mapping task title', () => {
    expect(DASHBOARD_STORAGE_TASK_TITLES.has(AGENDA_PROJECT_MAP_TASK_TITLE)).toBe(true)
  })

  it('includes every other known dashboard storage-task title', () => {
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('* _GITHUB_PR_DATA_')).toBe(true)
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('* _STARRED_ITEMS_')).toBe(true)
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('* _PROJECT_OVERVIEW_MAPPING_')).toBe(true)
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('* _DAILY_BASICS_DATA_')).toBe(true)
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('* _DAILY_CHECKLIST_DATA_')).toBe(true)
  })

  it('does not match an ordinary task title', () => {
    expect(DASHBOARD_STORAGE_TASK_TITLES.has('Buy milk')).toBe(false)
  })
})

describe('labelForAgenda', () => {
  it('returns the Todoist label for a known agenda id', () => {
    expect(labelForAgenda('agenda-jim' as AgendaId)).toBe('jim')
  })

  it('throws for an agenda with no Todoist label mapping', () => {
    expect(() => labelForAgenda('agenda-ghost' as AgendaId)).toThrow('No Todoist label mapped for agenda')
  })
})
