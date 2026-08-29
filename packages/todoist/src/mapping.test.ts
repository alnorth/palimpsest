import { describe, it, expect } from 'vitest'
import {
  todoistProjectUrl,
  todoistTaskUrl,
  extractProjectIdFromUrl,
  sphereLabelFor,
  oneOffsProjectFor,
  freeFloatingProjectFor,
  projectlessContainerFor,
  sphereParentProjectFor,
  TODOIST_WORK_ONEOFFS_ID,
  TODOIST_PERSONAL_ONEOFFS_ID,
  TODOIST_WORK_PROJECT_ID,
  TODOIST_PERSONAL_PROJECT_ID,
  TODOIST_RECURRING_ID,
  TODOIST_FUTURE_LOG_ID,
  TODOIST_INBOX_ID,
  WORK_SPHERE_ID,
  PERSONAL_SPHERE_ID,
  LABEL_TO_AGENDA_ID,
  AGENDA_ID_TO_LABEL,
  AGENDA_PROJECT_IDS,
  AGENDA_ID_TO_AGENDA_PROJECT_ID,
  EXCLUDED_PROJECT_IDS,
} from './mapping'
import { buildStateFromConfig, PALIMPSEST_CONFIG } from '@alnorth/palimpsest'
import type { AgendaId, ProjectId, TaskId } from '@alnorth/palimpsest'

describe('todoistProjectUrl', () => {
  it('builds correct URL', () => {
    const id = '6JJ9prC5CQMwjRP4' as ProjectId
    expect(todoistProjectUrl(id)).toBe('https://todoist.com/app/project/6JJ9prC5CQMwjRP4')
  })
})

describe('todoistTaskUrl', () => {
  it('builds correct URL', () => {
    const id = '6JJ9prC5CQMwjRP4' as TaskId
    expect(todoistTaskUrl(id)).toBe('https://todoist.com/app/task/6JJ9prC5CQMwjRP4')
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

  it('no sphere + dueDate → Inbox, not Future Log', () => {
    expect(freeFloatingProjectFor(undefined, { dueDate: '2026-12-01' })).toBe(TODOIST_INBOX_ID)
  })

  it('no sphere + dueDateExpression → Inbox, not Recurring', () => {
    expect(freeFloatingProjectFor(undefined, { dueDateExpression: 'every monday' })).toBe(TODOIST_INBOX_ID)
  })

  it('no sphere + no dates → falls back to Work one-offs (unaffected: only dated tasks require a sphere)', () => {
    expect(freeFloatingProjectFor(undefined, {})).toBe(TODOIST_WORK_ONEOFFS_ID)
  })
})

describe('projectlessContainerFor', () => {
  // The read path (resolveSphereFromTask/buildPalimpsestTask) checks AGENDA_PROJECT_IDS before
  // falling back to the due-date-bucketed free-floating containers — viaAgendaProject makes that
  // same priority decision available to callers directly, rather than a caller re-deriving it by
  // comparing the returned id back against AGENDA_ID_TO_AGENDA_PROJECT_ID itself.
  it('agenda with a dedicated project → that project, viaAgendaProject: true', () => {
    expect(projectlessContainerFor(WORK_SPHERE_ID, 'agenda-jim' as AgendaId, {})).toEqual({
      id: AGENDA_ID_TO_AGENDA_PROJECT_ID['agenda-jim'],
      viaAgendaProject: true,
    })
  })

  it('agenda with no dedicated project → falls back to the free-floating bucket, viaAgendaProject: false', () => {
    expect(projectlessContainerFor(WORK_SPHERE_ID, 'agenda-ghost' as AgendaId, {})).toEqual({
      id: TODOIST_WORK_ONEOFFS_ID,
      viaAgendaProject: false,
    })
  })

  it('no agenda → free-floating bucket, viaAgendaProject: false', () => {
    expect(projectlessContainerFor(WORK_SPHERE_ID, undefined, {})).toEqual({
      id: TODOIST_WORK_ONEOFFS_ID,
      viaAgendaProject: false,
    })
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

describe('LABEL_TO_AGENDA_ID / PALIMPSEST_CONFIG stay in sync', () => {
  const { agendas } = buildStateFromConfig(PALIMPSEST_CONFIG)
  const configuredAgendaIds = new Set(agendas.keys())

  it('every agenda in PALIMPSEST_CONFIG has a Todoist label mapping', () => {
    for (const id of configuredAgendaIds) {
      expect(AGENDA_ID_TO_LABEL[id]).toBeDefined()
    }
  })

  it('every label in LABEL_TO_AGENDA_ID points at an agenda that exists in PALIMPSEST_CONFIG', () => {
    for (const id of Object.values(LABEL_TO_AGENDA_ID)) {
      expect(configuredAgendaIds.has(id)).toBe(true)
    }
  })

  it('no two labels map to the same agenda id', () => {
    const ids = Object.values(LABEL_TO_AGENDA_ID)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('AGENDA_PROJECT_IDS', () => {
  const { agendas } = buildStateFromConfig(PALIMPSEST_CONFIG)

  it('every agenda-specific project points at an agenda that exists in PALIMPSEST_CONFIG, in the correct sphere', () => {
    for (const info of Object.values(AGENDA_PROJECT_IDS)) {
      const agenda = agendas.get(info.agendaId)
      expect(agenda).toBeDefined()
      expect(agenda?.sphereId).toBe(info.sphereId)
    }
  })

  it('every agenda-specific project id is excluded from becoming a palimpsest project', () => {
    for (const projectId of Object.keys(AGENDA_PROJECT_IDS)) {
      expect(EXCLUDED_PROJECT_IDS.has(projectId)).toBe(true)
    }
  })

  it('no two agenda-specific projects map to the same agenda id', () => {
    const ids = Object.values(AGENDA_PROJECT_IDS).map(info => info.agendaId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('AGENDA_ID_TO_AGENDA_PROJECT_ID is the exact inverse of AGENDA_PROJECT_IDS', () => {
    for (const [projectId, info] of Object.entries(AGENDA_PROJECT_IDS)) {
      expect(AGENDA_ID_TO_AGENDA_PROJECT_ID[info.agendaId]).toBe(projectId)
    }
  })
})
