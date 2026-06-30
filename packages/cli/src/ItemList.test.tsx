import React from 'react'
import { describe, test, expect } from 'vitest'
import { renderToString } from 'ink'
import { createEmptyState } from 'palimpsest'
import type { Task, Project, TaskId, ProjectId, SphereId } from 'palimpsest'
import type { ListGroup, ListItem, ProjectStats } from 'palimpsest-ui-core'
import { ItemList } from './ItemList.js'
import { stripAnsi, lines } from './testUtils.js'

function makeTask(id: string, title: string): Task {
  return {
    id: id as TaskId,
    title,
    description: '',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sphereId: 'sph1' as SphereId,
  }
}

function makeProject(id: string, name: string): Project {
  return {
    id: id as ProjectId,
    sphereId: 'sph1' as SphereId,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const EMPTY_STATS: ProjectStats = { hasNext: new Set(), taskCount: new Map() }

function taskGroup(title: string, ...tasks: Task[]): ListGroup<ListItem> {
  return { title, items: tasks.map(task => ({ kind: 'task' as const, task })) }
}

function projectGroup(title: string, ...projects: Project[]): ListGroup<ListItem> {
  return { title, items: projects.map(project => ({ kind: 'project' as const, project })) }
}

function render(groups: ListGroup<ListItem>[], emptyMessage?: string) {
  return renderToString(
    <ItemList
      groups={groups}
      selectedItem={undefined}
      state={createEmptyState()}
      projectStats={EMPTY_STATS}
      {...(emptyMessage !== undefined ? { emptyMessage } : {})}
    />,
    { columns: 80 }
  )
}

describe('ItemList', () => {
  test('zero total items renders emptyMessage', () => {
    const output = render([])
    expect(stripAnsi(output)).toContain('No items.')
  })

  test('custom emptyMessage is shown', () => {
    const output = render([], 'Nothing here.')
    expect(stripAnsi(output)).toContain('Nothing here.')
  })

  test('group with a non-empty title renders the title', () => {
    const output = render([taskGroup('Today', makeTask('t1', 'Buy milk'))])
    expect(stripAnsi(output)).toContain('Today')
  })

  test('group with empty title renders no group label', () => {
    const output = render([taskGroup('', makeTask('t1', 'Buy milk'))])
    const ls = lines(output)
    expect(ls.some(l => l.trim() === 'Today')).toBe(false)
  })

  test('task item renders task title', () => {
    const output = render([taskGroup('', makeTask('t1', 'Call dentist'))])
    expect(stripAnsi(output)).toContain('Call dentist')
  })

  test('project item renders project name', () => {
    const output = render([projectGroup('', makeProject('p1', 'Website'))])
    expect(stripAnsi(output)).toContain('Website')
  })

  test('empty group inside non-empty multi-group renders — placeholder', () => {
    const emptyGroup: ListGroup<ListItem> = { title: 'Upcoming', items: [] }
    const groups = [taskGroup('Today', makeTask('t1', 'Buy milk')), emptyGroup]
    const output = render(groups)
    expect(stripAnsi(output)).toContain('—')
  })

  test('multiple groups rendered in order', () => {
    const groups = [
      taskGroup('Today', makeTask('t1', 'Alpha')),
      taskGroup('Upcoming', makeTask('t2', 'Beta')),
    ]
    const output = render(groups)
    const combined = stripAnsi(output)
    expect(combined.indexOf('Alpha')).toBeLessThan(combined.indexOf('Beta'))
  })
})
