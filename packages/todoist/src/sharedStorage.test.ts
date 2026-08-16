import { describe, it, expect } from 'vitest'
import {
  AGENDA_PROJECT_MAP_TASK_TITLE,
  SELF_AGENDA_LABEL,
  findAgendaMapTask,
  parseAgendaMapping,
  serializeAgendaMapping,
  resolveProjectAgendaIds,
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

describe('resolveProjectAgendaIds', () => {
  it('translates recognized labels to AgendaIds', () => {
    const resolved = resolveProjectAgendaIds({ proj1: 'jim' })
    expect(resolved).toEqual({ proj1: 'agenda-jim' as AgendaId })
  })

  it('excludes SELF_AGENDA_LABEL ("me") deliberately', () => {
    const resolved = resolveProjectAgendaIds({ proj1: SELF_AGENDA_LABEL })
    expect(resolved).toEqual({})
  })

  it('drops a genuinely unrecognized/typo label', () => {
    const resolved = resolveProjectAgendaIds({ proj1: 'not-a-real-label' })
    expect(resolved).toEqual({})
  })

  it('resolves multiple entries, mixing recognized, self, and unrecognized labels', () => {
    const resolved = resolveProjectAgendaIds({
      proj1: 'jim',
      proj2: SELF_AGENDA_LABEL,
      proj3: 'han',
      proj4: 'bogus',
    })
    expect(resolved).toEqual({ proj1: 'agenda-jim' as AgendaId, proj3: 'agenda-han' as AgendaId })
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
