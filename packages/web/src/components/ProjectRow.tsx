import { Group, Text } from '@mantine/core'
import type { Project } from 'palimpsest'
import type { ProjectStats } from 'palimpsest-ui-core'

interface Props {
  project: Project
  flatIndex: number
  isSelected: boolean
  isMobile: boolean
  projectStats: ProjectStats
  showArchived: boolean
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export function ProjectRow({ project, flatIndex, isSelected, isMobile, projectStats, showArchived, onHover, onActivate }: Props) {
  const sel = isSelected && !isMobile
  const hasNext = projectStats.hasNext.has(project.id)
  const count = projectStats.taskCount.get(project.id) ?? 0
  const c: 'blue' | 'red' | undefined = sel ? 'blue' : (!showArchived && !hasNext ? 'red' : undefined)
  return (
    <Group
      justify="space-between"
      px="xs"
      py={2}
      onMouseEnter={() => onHover?.(flatIndex)}
      onClick={() => onActivate?.(flatIndex)}
      style={{
        background: sel ? 'var(--mantine-color-blue-light)' : undefined,
        borderRadius: 4,
        cursor: onActivate ? 'pointer' : 'default',
        fontFamily: 'monospace',
        userSelect: 'none',
      }}
    >
      <Text size="sm" {...(c !== undefined ? { c } : {})}>
        <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{sel ? '>' : ''}</Text>
        {project.name}
      </Text>
      <Group gap="xs">
        {project.archivedAt !== undefined && <Text size="xs" c="dimmed">{formatDate(project.archivedAt)}</Text>}
        <Text size="xs" c="dimmed">{count}</Text>
      </Group>
    </Group>
  )
}
