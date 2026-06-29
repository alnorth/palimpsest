import { describe, it, expect } from 'vitest'
import {
  todoistProjectUrl,
  extractProjectIdFromUrl,
  sphereLabelFor,
  oneOffsProjectFor,
  freeFloatingProjectFor,
  sphereParentProjectFor,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
} from './mapping.js'
import type { ProjectId } from 'palimpsest'

describe('todoistProjectUrl', () => {
  it('builds correct URL', () => {
    const id = '6JJ9prC5CQMwjRP4' as ProjectId
    expect(todoistProjectUrl(id)).toBe('https://todoist.com/app/project/6JJ9prC5CQMwjRP4')
  })
})

describe('extractProjectIdFromUrl', () => {
  it('extracts a project ID from a valid URL', () => {
    expect(extractProjectIdFromUrl('https://todoist.com/app/project/6JJ9prC5CQMwjRP4'))
      .toBe('6JJ9prC5CQMwjRP4')
  })

  it('returns undefined for non-matching string', () => {
    expect(extractProjectIdFromUrl('not a url')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(extractProjectIdFromUrl('')).toBeUndefined()
  })
})

describe('sphereLabelFor', () => {
  it('personal sphere → personal', () => {
    expect(sphereLabelFor(PERSONAL_SPHERE_ID)).toBe('personal')
  })

  it('work sphere → work', () => {
    expect(sphereLabelFor(WORK_SPHERE_ID)).toBe('work')
  })
})

describe('oneOffsProjectFor', () => {
  it('personal → personal one-offs project', () => {
    expect(oneOffsProjectFor(PERSONAL_SPHERE_ID)).toBe(TODOIST_PERSONAL_ONEOFFS_ID)
  })

  it('work → work one-offs project', () => {
    expect(oneOffsProjectFor(WORK_SPHERE_ID)).toBe(TODOIST_WORK_ONEOFFS_ID)
  })
})

describe('freeFloatingProjectFor', () => {
  it('dueDateExpression → Recurring (sphere-independent)', () => {
    expect(freeFloatingProjectFor(WORK_SPHERE_ID,     { dueDateExpression: 'every monday' })).toBe(TODOIST_RECURRING_ID)
    expect(freeFloatingProjectFor(PERSONAL_SPHERE_ID, { dueDateExpression: 'daily' })).toBe(TODOIST_RECURRING_ID)
  })

  it('dueDate only → Future Log (sphere-independent)', () => {
    expect(freeFloatingProjectFor(WORK_SPHERE_ID,     { dueDate: '2026-12-01' })).toBe(TODOIST_FUTURE_LOG_ID)
    expect(freeFloatingProjectFor(PERSONAL_SPHERE_ID, { dueDate: '2026-12-01' })).toBe(TODOIST_FUTURE_LOG_ID)
  })

  it('dueDateExpression takes priority over dueDate', () => {
    expect(freeFloatingProjectFor(WORK_SPHERE_ID, { dueDate: '2026-12-01', dueDateExpression: 'every monday' }))
      .toBe(TODOIST_RECURRING_ID)
  })

  it('no dates → One-Offs (sphere-specific)', () => {
    expect(freeFloatingProjectFor(WORK_SPHERE_ID,     {})).toBe(TODOIST_WORK_ONEOFFS_ID)
    expect(freeFloatingProjectFor(PERSONAL_SPHERE_ID, {})).toBe(TODOIST_PERSONAL_ONEOFFS_ID)
  })
})

describe('sphereParentProjectFor', () => {
  it('personal → personal container project', () => {
    expect(sphereParentProjectFor(PERSONAL_SPHERE_ID)).toBe(TODOIST_PERSONAL_PROJECT_ID)
  })

  it('work → work container project', () => {
    expect(sphereParentProjectFor(WORK_SPHERE_ID)).toBe(TODOIST_WORK_PROJECT_ID)
  })
})
