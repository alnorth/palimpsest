import React from 'react'
import { Stack, Text } from '@mantine/core'
import type { Task } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import { getProject, getAgenda } from 'palimpsest'
import { PROJECT_PREFIX, AGENDA_PREFIX } from 'palimpsest-ui-core'

interface Props {
  tasks: Task[]
  selected: number
  state: ProjectionState
  showProject?: boolean
  emptyMessage?: string
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

export function TaskList({ tasks, selected, state, showProject, emptyMessage, onHover, onActivate }: Props) {
  if (tasks.length === 0) {
    return <Text c="dimmed" size="sm">{emptyMessage ?? 'No tasks.'}</Text>
  }
  return (
    <Stack gap={2}>
      {tasks.map((task, i) => {
        const isSelected = i === selected
        const project = showProject && task.projectId !== undefined ? getProject(state, task.projectId) : undefined
        const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
        return (
          <Text
            key={task.id}
            size="sm"
            px="xs"
            py={2}
            {...(isSelected ? { c: 'blue' } : {})}
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
            {isSelected ? '> ' : '  '}
            {task.isNext === true && <Text span c="yellow.6">→ </Text>}
            {task.isStarred === true && <Text span c="yellow.6">★ </Text>}
            {task.title}
            {project !== undefined && <Text span size="xs" c="dimmed"> · {PROJECT_PREFIX}{project.name}</Text>}
            {agenda !== undefined && <Text span size="xs" c="dimmed"> · {AGENDA_PREFIX}{agenda.title}</Text>}
            {task.dueDate !== undefined && <Text span size="xs" c="dimmed"> · {task.dueDate}</Text>}
          </Text>
        )
      })}
    </Stack>
  )
}
