import React from 'react'
import { describe, test, expect } from 'vitest'
import { renderToString } from 'ink'
import type { Project, ProjectId, SphereId } from 'palimpsest'
import type { ProjectStats } from 'palimpsest-ui-core'
import { ProjectRow } from './ProjectRow.js'
import { lines } from './testUtils.js'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj1' as ProjectId,
    sphereId: 'sph1' as SphereId,
    name: 'My Project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeStats(overrides: { hasNext?: Set<ProjectId>; taskCount?: Map<ProjectId, number> } = {}): ProjectStats {
  return {
    hasNext: overrides.hasNext ?? new Set(),
    taskCount: overrides.taskCount ?? new Map(),
  }
}

function render(project: Project, opts: { isSelected?: boolean; stats?: ProjectStats; showArchived?: boolean } = {}) {
  const { isSelected = false, stats = makeStats(), showArchived = false } = opts
  return renderToString(
    <ProjectRow project={project} isSelected={isSelected} projectStats={stats} showArchived={showArchived} />,
    { columns: 80 }
  )
}

describe('ProjectRow', () => {
  test('renders project name', () => {
    const output = render(makeProject())
    expect(lines(output)[0]).toContain('My Project')
  })

  test('unselected shows double-space prefix', () => {
    const output = render(makeProject())
    expect(lines(output)[0]).toMatch(/^  /)
  })

  test('selected shows > prefix', () => {
    const output = render(makeProject(), { isSelected: true })
    expect(lines(output)[0]).toMatch(/^> /)
  })

  test('taskCount shown in output', () => {
    const projectId = 'proj1' as ProjectId
    const stats = makeStats({ taskCount: new Map([[projectId, 5]]) })
    const output = render(makeProject({ id: projectId }), { stats })
    expect(lines(output).join('\n')).toContain('5')
  })

  test('archivedAt set → formatted date appears in output', () => {
    const output = render(makeProject({ archivedAt: '2026-06-30T12:00:00.000Z' }))
    expect(lines(output).join('\n')).toContain('30 Jun')
  })

  test('archivedAt undefined → no date in output', () => {
    const output = render(makeProject())
    expect(lines(output).join('\n')).not.toMatch(/\d+ (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)
  })
})
