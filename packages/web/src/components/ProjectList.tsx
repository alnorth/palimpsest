import React from 'react'
import { Stack, Group, Text } from '@mantine/core'
import type { Project } from 'palimpsest'
import type { ProjectStats } from 'palimpsest-ui-core'

interface Props {
  projects: Project[]
  selected: number
  projectStats: ProjectStats
  showArchived: boolean
  emptyMessage?: string
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export function ProjectList({ projects, selected, projectStats, showArchived, emptyMessage, onHover, onActivate }: Props) {
  if (projects.length === 0) {
    return <Text c="dimmed" size="sm">{emptyMessage ?? 'No projects.'}</Text>
  }
  return (
    <Stack gap={2}>
      {projects.map((project, i) => {
        const isSelected = i === selected
        const hasNext = projectStats.hasNext.has(project.id)
        const count = projectStats.taskCount.get(project.id) ?? 0
        const c: 'blue' | 'red' | undefined = isSelected ? 'blue' : (!showArchived && !hasNext ? 'red' : undefined)
        return (
          <Group
            key={project.id}
            justify="space-between"
            px="xs"
            py={2}
            onMouseEnter={() => onHover?.(i)}
            onClick={() => onActivate?.(i)}
            style={{
              background: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
              borderRadius: 4,
              cursor: onActivate ? 'pointer' : 'default',
              fontFamily: 'monospace',
              userSelect: 'none',
            }}
          >
            <Text size="sm" {...(c !== undefined ? { c } : {})}>
              <Text span style={{ display: 'inline-block', width: '2ch' }}>{isSelected ? '>' : ''}</Text>{project.name}
            </Text>
            <Group gap="xs">
              {project.archivedAt !== undefined && <Text size="xs" c="dimmed">{formatDate(project.archivedAt)}</Text>}
              <Text size="xs" c="dimmed">{count}</Text>
            </Group>
          </Group>
        )
      })}
    </Stack>
  )
}
