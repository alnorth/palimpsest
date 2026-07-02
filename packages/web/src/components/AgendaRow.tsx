import { Group, Text } from '@mantine/core'
import type { Agenda } from 'palimpsest'

interface Props {
  agenda: Agenda
  flatIndex: number
  isSelected: boolean
  isMobile: boolean
  taskCount: number
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

export function AgendaRow({ agenda, flatIndex, isSelected, isMobile, taskCount, onHover, onActivate }: Props) {
  const sel = isSelected && !isMobile
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
      <Text size="sm" {...(sel ? { c: 'blue' as const } : {})}>
        <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{sel ? '>' : ''}</Text>
        {agenda.title}
      </Text>
      <Text size="xs" c="dimmed">{taskCount}</Text>
    </Group>
  )
}
