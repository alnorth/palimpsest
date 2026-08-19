import { describe, it, expect } from 'vitest'
import { deriveTodoistShape } from './deriveTodoistShape'
import type { AgendaId, ContextId, ProjectId } from '@alnorth/palimpsest'
import {
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_FUTURE_LOG_ID,
  AGENDA_ID_TO_AGENDA_PROJECT_ID,
} from './mapping'

const jimId = 'agenda-jim' as AgendaId

function fields(overrides: Partial<Parameters<typeof deriveTodoistShape>[0]> = {}) {
  return { title: 'Task', description: '', ...overrides }
}

describe('deriveTodoistShape — content/description', () => {
  it('content is the title verbatim', () => {
    expect(deriveTodoistShape(fields({ title: 'Buy milk' })).content).toBe('Buy milk')
  })

  it('description passes through when waitingFor is absent', () => {
    expect(deriveTodoistShape(fields({ description: 'notes' })).description).toBe('notes')
  })

  it('description passes through for waitingFor review', () => {
    expect(deriveTodoistShape(fields({ description: 'notes', waitingFor: { kind: 'review' } })).description)
      .toBe('notes')
  })

  it('description passes through for waitingFor agenda', () => {
    expect(deriveTodoistShape(fields({ description: 'notes', waitingFor: { kind: 'agenda', agendaId: jimId } })).description)
      .toBe('notes')
  })

  it('description is overridden by the project URL for waitingFor project', () => {
    const projectId = 'p1' as ProjectId
    expect(deriveTodoistShape(fields({ description: 'notes', waitingFor: { kind: 'project', projectId } })).description)
      .toBe('https://todoist.com/app/project/p1')
  })

  it('description is overridden by the card URL for waitingFor trello', () => {
    expect(deriveTodoistShape(fields({
      description: 'notes',
      waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' },
    })).description).toBe('https://trello.com/c/abc')
  })
})

describe('deriveTodoistShape — labels', () => {
  it('delegates to computeLabels for isNext', () => {
    expect(deriveTodoistShape(fields({ isNext: true })).labels).toEqual(['next'])
  })

  it('delegates to computeLabels for agendaId', () => {
    expect(deriveTodoistShape(fields({ agendaId: jimId })).labels).toEqual(['jim'])
  })

  it('delegates to computeLabels for contextId', () => {
    expect(deriveTodoistShape(fields({ contextId: 'ctx-quick' as ContextId })).labels).toEqual(['quick'])
  })

  it('delegates to computeLabels for waitingFor', () => {
    expect(deriveTodoistShape(fields({ waitingFor: { kind: 'review' } })).labels).toEqual(['waiting', 'nonagenda'])
  })
})

describe('deriveTodoistShape — priority', () => {
  it('isStarred true → 4', () => {
    expect(deriveTodoistShape(fields({ isStarred: true })).priority).toBe(4)
  })

  it('isStarred absent → 1', () => {
    expect(deriveTodoistShape(fields()).priority).toBe(1)
  })
})

describe('deriveTodoistShape — due', () => {
  it('neither dueDate nor dueDateExpression → undefined', () => {
    expect(deriveTodoistShape(fields()).due).toBeUndefined()
  })

  it('dueDate only → { date }', () => {
    expect(deriveTodoistShape(fields({ dueDate: '2026-08-01' })).due).toEqual({ date: '2026-08-01' })
  })

  it('dueDateExpression only → { string }', () => {
    expect(deriveTodoistShape(fields({ dueDateExpression: 'every monday' })).due).toEqual({ string: 'every monday' })
  })

  it('both → { date, string }', () => {
    expect(deriveTodoistShape(fields({ dueDate: '2026-08-01', dueDateExpression: 'every monday' })).due)
      .toEqual({ date: '2026-08-01', string: 'every monday' })
  })
})

describe('deriveTodoistShape — containerProjectId', () => {
  it('projectId set → String(projectId), ignoring agenda/due entirely', () => {
    expect(deriveTodoistShape(fields({
      projectId: 'proj2' as ProjectId,
      agendaId: jimId,
      dueDate: '2026-08-01',
    })).containerProjectId).toBe('proj2')
  })

  it('projectId unset with no agenda → delegates to the ordinary free-floating bucket', () => {
    expect(deriveTodoistShape(fields({ sphereId: WORK_SPHERE_ID })).containerProjectId)
      .toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('projectId unset with no agenda but a due date → delegates to the due-date bucket', () => {
    expect(deriveTodoistShape(fields({ sphereId: WORK_SPHERE_ID, dueDate: '2026-08-01' })).containerProjectId)
      .toBe(TODOIST_FUTURE_LOG_ID)
  })

  it('projectId unset with an agenda that has a dedicated project → that project, even with a due date', () => {
    expect(deriveTodoistShape(fields({
      sphereId: WORK_SPHERE_ID,
      agendaId: jimId,
      dueDate: '2026-08-01',
    })).containerProjectId).toBe(AGENDA_ID_TO_AGENDA_PROJECT_ID[jimId])
  })

  it('projectId unset, sphereId unset, no due state → falls back to Work One-Offs', () => {
    expect(deriveTodoistShape(fields()).containerProjectId).toBe(TODOIST_WORK_ONEOFFS_ID)
  })

  it('respects the Personal sphere for the free-floating bucket', () => {
    expect(deriveTodoistShape(fields({ sphereId: PERSONAL_SPHERE_ID })).containerProjectId)
      .not.toBe(TODOIST_WORK_ONEOFFS_ID)
  })
})
