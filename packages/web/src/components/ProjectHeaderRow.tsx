import { Group, Text } from '@mantine/core'
import type { Project } from 'palimpsest'
import type { ProjectStats } from 'palimpsest-ui-core'

interface Props {
  project: Project
  flatIndex: number
  isSelected: boolean
  isMobile: boolean
  projectStats: ProjectStats
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

export function ProjectHeaderRow({ project, flatIndex, isSelected, isMobile, projectStats, onHover, onActivate }: Props) {
  const sel = isSelected && !isMobile
  const count = projectStats.taskCount.get(project.id) ?? 0
  return (
    <Group
      justify="space-between"
      px="xs"
      py={4}
      mb={4}
      onMouseEnter={() => onHover?.(flatIndex)}
      onClick={() => onActivate?.(flatIndex)}
      style={{
        background: sel ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-default-border)',
        borderRadius: 4,
        cursor: onActivate ? 'pointer' : 'default',
        fontFamily: 'monospace',
        userSelect: 'none',
      }}
    >
      <Text size="sm" fw={600} {...(sel ? { c: 'blue' as const } : {})}>
        <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{sel ? '>' : ''}</Text>
        {project.name}
        {project.isArchived === true && <Text span size="xs" c="dimmed"> (archived)</Text>}
      </Text>
      <Text size="xs" c="dimmed">{count}</Text>
    </Group>
  )
}
