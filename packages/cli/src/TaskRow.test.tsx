import React from 'react'
import { describe, test, expect } from 'vitest'
import { renderToString } from 'ink'
import { createEmptyState } from 'palimpsest'
import type { Task, ProjectionState, Project, Agenda, Context, TaskId, ProjectId, SphereId, AgendaId, ContextId } from 'palimpsest'
import { TaskRow } from './TaskRow.js'

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

function lines(output: string): string[] {
  return stripAnsi(output).split('\n')
}

const TODAY = '2026-06-30'
const FUTURE = '2026-12-25'
const PAST = '2026-01-01'

const BASE_TASK: Task = {
  id: 'task1' as TaskId,
  title: 'Buy milk',
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
  const project: Project = {
    id,
    sphereId: 'sph1' as SphereId,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
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

function render(task: Task, opts: { isSelected?: boolean; state?: ProjectionState; showProject?: boolean } = {}) {
  const { isSelected = false, state = createEmptyState(), showProject = false } = opts
  return renderToString(
    <TaskRow task={task} isSelected={isSelected} state={state} showProject={showProject} />,
    { columns: 80 }
  )
}

describe('TaskRow', () => {
  describe('layout: twoLine separation', () => {
    test('task with meta renders title and meta on separate lines', () => {
      const output = render(makeTask({ dueDate: FUTURE }))
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('Buy milk'))
      const metaLine  = ls.findIndex(l => l.includes(FUTURE))
      expect(titleLine).toBeGreaterThanOrEqual(0)
      expect(metaLine).toBe(titleLine + 1)
    })

    test('meta never appears on the same line as the title', () => {
      const output = render(makeTask({ dueDate: FUTURE }))
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('Buy milk'))
      expect(ls[titleLine]).not.toContain(FUTURE)
    })

    test('task without meta renders on single line', () => {
      const output = render(makeTask({}))
      const ls = lines(output)
      const count = ls.filter(l => l.includes('Buy milk')).length
      expect(count).toBe(1)
    })
  })

  describe('selection prefix', () => {
    test('unselected shows double-space prefix', () => {
      const output = render(makeTask({}))
      expect(lines(output)[0]).toMatch(/^  /)
    })

    test('selected shows > prefix', () => {
      const output = render(makeTask({}), { isSelected: true })
      expect(lines(output)[0]).toMatch(/^> /)
    })

    test('selected with meta: > prefix on title line', () => {
      const output = render(makeTask({ dueDate: FUTURE }), { isSelected: true })
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('Buy milk'))
      expect(ls[titleLine]).toMatch(/^> /)
    })
  })

  describe('task indicators', () => {
    test('isNext shows → indicator', () => {
      const output = render(makeTask({ isNext: true }))
      expect(stripAnsi(output)).toContain('→')
    })

    test('not isNext shows space (no →)', () => {
      const output = render(makeTask({}))
      expect(stripAnsi(output)).not.toContain('→')
    })

    test('isStarred shows ★ indicator', () => {
      const output = render(makeTask({ isStarred: true }))
      expect(stripAnsi(output)).toContain('★')
    })

    test('not isStarred shows no ★', () => {
      const output = render(makeTask({}))
      expect(stripAnsi(output)).not.toContain('★')
    })

    test('isNext and isStarred both shown on title line', () => {
      const output = render(makeTask({ isNext: true, isStarred: true }))
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('Buy milk'))
      expect(ls[titleLine]).toContain('→')
      expect(ls[titleLine]).toContain('★')
    })
  })

  describe('due date meta', () => {
    test('future due date shown on meta line', () => {
      const output = render(makeTask({ dueDate: FUTURE }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes(FUTURE))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('due today shown on meta line', () => {
      const output = render(makeTask({ dueDate: TODAY }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes(TODAY))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('overdue date shown on meta line', () => {
      const output = render(makeTask({ dueDate: PAST }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes(PAST))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })
  })

  describe('recurrence meta', () => {
    test('dueDateExpression shown on meta line with ↻ prefix', () => {
      const output = render(makeTask({ dueDateExpression: 'weekly' }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('↻') && l.includes('weekly'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })
  })

  describe('description indicator', () => {
    test('non-empty description shows ¶ on meta line', () => {
      const output = render(makeTask({ description: 'some notes' }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('¶'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('empty description shows no ¶', () => {
      const output = render(makeTask({ description: '' }))
      expect(stripAnsi(output)).not.toContain('¶')
    })
  })

  describe('project meta', () => {
    test('showProject=true shows project name on meta line', () => {
      const projectId = 'proj1' as ProjectId
      const state = stateWithProject(projectId, 'Work')
      const output = render(makeTask({ projectId }), { state, showProject: true })
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('#Work'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('showProject=false hides project name', () => {
      const projectId = 'proj1' as ProjectId
      const state = stateWithProject(projectId, 'Work')
      const output = render(makeTask({ projectId }), { state, showProject: false })
      expect(stripAnsi(output)).not.toContain('#Work')
    })
  })

  describe('agenda meta', () => {
    test('agendaId shows agenda title with @ prefix on meta line', () => {
      const agendaId = 'ag1' as AgendaId
      const state = stateWithAgenda(agendaId, 'Manager 1:1')
      const output = render(makeTask({ agendaId }), { state })
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('@Manager 1:1'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })
  })

  describe('context meta', () => {
    test('contextId shows context name with $ prefix on meta line', () => {
      const contextId = 'ctx1' as ContextId
      const state = stateWithContext(contextId, 'Home')
      const output = render(makeTask({ contextId }), { state })
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('$Home'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })
  })

  describe('waitingFor meta', () => {
    test('waitingFor review shows "w/ review" on meta line', () => {
      const output = render(makeTask({ waitingFor: { kind: 'review' } }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('w/ review'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('waitingFor trello shows "w/ Trello" on meta line', () => {
      const output = render(makeTask({ waitingFor: { kind: 'trello', cardUrl: 'https://trello.com/c/abc' } }))
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('w/ Trello'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('waitingFor agenda shows agenda name on meta line', () => {
      const agendaId = 'ag1' as AgendaId
      const state = stateWithAgenda(agendaId, 'Boss')
      const output = render(
        makeTask({ waitingFor: { kind: 'agenda', agendaId } }),
        { state }
      )
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('w/ @Boss'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })

    test('waitingFor project shows project name on meta line', () => {
      const projectId = 'proj1' as ProjectId
      const state = stateWithProject(projectId, 'Launch')
      const output = render(
        makeTask({ waitingFor: { kind: 'project', projectId } }),
        { state }
      )
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('w/ #Launch'))
      expect(metaLine).toBeGreaterThanOrEqual(0)
    })
  })

  describe('multiple meta items', () => {
    test('multiple meta items separated by ·', () => {
      const output = render(makeTask({ description: 'notes', dueDate: FUTURE }))
      const ls = lines(output)
      const metaLine = ls.find(l => l.includes('¶') && l.includes(FUTURE))
      expect(metaLine).toBeDefined()
      expect(metaLine).toContain('·')
    })

    test('multiple meta items: all on the single meta line below title', () => {
      const agendaId = 'ag1' as AgendaId
      const state = stateWithAgenda(agendaId, 'Standup')
      const output = render(makeTask({ agendaId, dueDate: FUTURE }), { state })
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('Buy milk'))
      const metaLine  = ls.findIndex(l => l.includes('@Standup') && l.includes(FUTURE))
      expect(metaLine).toBe(titleLine + 1)
    })
  })

  describe('title content', () => {
    test('task title is shown', () => {
      const output = render(makeTask({ title: 'Call dentist' }))
      expect(stripAnsi(output)).toContain('Call dentist')
    })

    test('title appears on the first non-empty line', () => {
      const output = render(makeTask({ title: 'Call dentist' }))
      const ls = lines(output)
      expect(ls[0]).toContain('Call dentist')
    })
  })
})
