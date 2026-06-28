import React from 'react'
import { Stack, Group, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Project } from 'palimpsest'
import type { ProjectStats, ListGroup } from 'palimpsest-ui-core'

interface Props {
  groups: ListGroup<Project>[]
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

export function ProjectList({ groups, selected, projectStats, showArchived, emptyMessage, onHover, onActivate }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
  if (totalItems === 0) {
    return <Text c="dimmed" size="sm">{emptyMessage ?? 'No projects.'}</Text>
  }
  let offset = 0
  return (
    <Stack gap={2}>
      {groups.map((group, gi) => {
        const groupOffset = offset
        offset += group.items.length
        return (
          <React.Fragment key={gi}>
            {group.title !== '' && (
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" px="xs" {...(gi > 0 ? { pt: 'xs' } : {})}>
                {group.title}
              </Text>
            )}
            {group.items.map((project, i) => {
              const flatIndex = groupOffset + i
              const isSelected = flatIndex === selected && !isMobile
              const hasNext = projectStats.hasNext.has(project.id)
              const count = projectStats.taskCount.get(project.id) ?? 0
              const c: 'blue' | 'red' | undefined = isSelected ? 'blue' : (!showArchived && !hasNext ? 'red' : undefined)
              return (
                <Group
                  key={project.id}
                  justify="space-between"
                  px="xs"
                  py={2}
                  onMouseEnter={() => onHover?.(flatIndex)}
                  onClick={() => onActivate?.(flatIndex)}
                  style={{
                    background: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                    borderRadius: 4,
                    cursor: onActivate ? 'pointer' : 'default',
                    fontFamily: 'monospace',
                    userSelect: 'none',
                  }}
                >
                  <Text size="sm" {...(c !== undefined ? { c } : {})}>
                    <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{isSelected ? '>' : ''}</Text>{project.name}
                  </Text>
                  <Group gap="xs">
                    {project.archivedAt !== undefined && <Text size="xs" c="dimmed">{formatDate(project.archivedAt)}</Text>}
                    <Text size="xs" c="dimmed">{count}</Text>
                  </Group>
                </Group>
              )
            })}
          </React.Fragment>
        )
      })}
    </Stack>
  )
}
