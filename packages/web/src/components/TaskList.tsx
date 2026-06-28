import React from 'react'
import { Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Task } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import { getProject, getAgenda } from 'palimpsest'
import { PROJECT_PREFIX, AGENDA_PREFIX } from 'palimpsest-ui-core'
import type { ListGroup } from 'palimpsest-ui-core'

interface Props {
  groups: ListGroup<Task>[]
  selected: number
  state: ProjectionState
  showProject?: boolean
  emptyMessage?: string
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
  onComplete?: (task: Task) => void
}

export function TaskList({ groups, selected, state, showProject, emptyMessage, onHover, onActivate, onComplete }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
  if (totalItems === 0) {
    return <Text c="dimmed" size="sm">{emptyMessage ?? 'No tasks.'}</Text>
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
            {group.items.map((task, i) => {
              const flatIndex = groupOffset + i
              const isSelected = flatIndex === selected && !isMobile
              const project = showProject && task.projectId !== undefined ? getProject(state, task.projectId) : undefined
              const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
              return (
                <Text
                  key={task.id}
                  size="sm"
                  px="xs"
                  py={2}
                  {...(isSelected ? { c: 'blue' } : {})}
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
                  <Text span visibleFrom="sm" style={{ display: 'inline-block', width: '2ch' }}>{isSelected ? '>' : ''}</Text>
                  {onComplete !== undefined && (
                    <Text
                      span
                      c={task.status === 'completed' ? 'green' : 'dimmed'}
                      onClick={(e) => { e.stopPropagation(); onComplete(task) }}
                      style={{ cursor: 'pointer' }}
                    >
                      {task.status === 'completed' ? '● ' : '○ '}
                    </Text>
                  )}
                  {task.isNext === true && <Text span c="yellow.6">{'→ '}</Text>}
                  {task.isStarred === true && <Text span c="yellow.6">{'★ '}</Text>}
                  {task.title}
                  {project !== undefined && <Text span size="xs" c="dimmed">{' · '}{PROJECT_PREFIX}{project.name}</Text>}
                  {agenda !== undefined && <Text span size="xs" c="dimmed">{' · '}{AGENDA_PREFIX}{agenda.title}</Text>}
                  {task.dueDate !== undefined && <Text span size="xs" c="dimmed">{' · '}{task.dueDate}</Text>}
                </Text>
              )
            })}
          </React.Fragment>
        )
      })}
    </Stack>
  )
}
