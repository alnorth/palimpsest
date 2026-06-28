import React from 'react'
import { Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Task, ProjectionState } from 'palimpsest'
import type { ListGroup } from 'palimpsest-ui-core'
import { TaskRow } from './TaskRow.js'

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
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
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
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  flatIndex={flatIndex}
                  isSelected={flatIndex === selected}
                  isMobile={isMobile}
                  state={state}
                  {...(showProject !== undefined ? { showProject } : {})}
                  {...(onHover !== undefined ? { onHover } : {})}
                  {...(onActivate !== undefined ? { onActivate } : {})}
                  {...(onComplete !== undefined ? { onComplete } : {})}
                />
              )
            })}
          </React.Fragment>
        )
      })}
    </Stack>
  )
}
