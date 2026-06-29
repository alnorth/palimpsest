import { describe, it, expect } from 'vitest'
import {
  normaliseDueString,
  todoistProjectUrl,
  extractProjectIdFromUrl,
  sphereLabelFor,
  oneOffsProjectFor,
  sphereParentProjectFor,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
} from './mapping.js'
import type { ProjectId } from 'palimpsest'

describe('normaliseDueString', () => {
  it('strips ! modifier', () => {
    expect(normaliseDueString('every! 3 weeks')).toBe('every 3 weeks')
  })

  it('strips multiple ! characters', () => {
    expect(normaliseDueString('every! monday')).toBe('every monday')
  })

  it('collapses extra spaces', () => {
    expect(normaliseDueString('every  day')).toBe('every day')
  })

  it('leaves a normal expression unchanged', () => {
    expect(normaliseDueString('every monday')).toBe('every monday')
  })
})

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

describe('sphereParentProjectFor', () => {
  it('personal → personal container project', () => {
    expect(sphereParentProjectFor(PERSONAL_SPHERE_ID)).toBe(TODOIST_PERSONAL_PROJECT_ID)
  })

  it('work → work container project', () => {
    expect(sphereParentProjectFor(WORK_SPHERE_ID)).toBe(TODOIST_WORK_PROJECT_ID)
  })
})
