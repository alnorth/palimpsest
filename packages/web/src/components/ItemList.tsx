import React from 'react'
import { Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { ListItem, ListGroup, ProjectStats } from 'palimpsest-ui-core'
import type { Task, ProjectionState } from 'palimpsest'
import { TaskRow } from './TaskRow.js'
import { ProjectRow } from './ProjectRow.js'

interface Props {
  groups: ListGroup<ListItem>[]
  selectedItem: ListItem | undefined
  state: ProjectionState
  projectStats: ProjectStats
  showArchived: boolean
  showProject?: boolean
  emptyMessage?: string
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
  onComplete?: (task: Task) => void
}

export function ItemList({ groups, selectedItem, state, projectStats, showArchived, showProject, emptyMessage, onHover, onActivate, onComplete }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
  if (totalItems === 0) {
    return <Text c="dimmed" size="sm">{emptyMessage ?? 'No items.'}</Text>
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
            {group.items.length === 0
              ? <Text c="dimmed" size="sm" px="xs">None.</Text>
              : group.items.map((item, i) => {
                  const flatIndex = groupOffset + i
                  if (item.kind === 'task') {
                    return (
                      <TaskRow
                        key={item.task.id}
                        task={item.task}
                        flatIndex={flatIndex}
                        isSelected={item === selectedItem}
                        isMobile={isMobile}
                        state={state}
                        {...(showProject !== undefined ? { showProject } : {})}
                        {...(onHover !== undefined ? { onHover } : {})}
                        {...(onActivate !== undefined ? { onActivate } : {})}
                        {...(onComplete !== undefined ? { onComplete } : {})}
                      />
                    )
                  } else {
                    return (
                      <ProjectRow
                        key={item.project.id}
                        project={item.project}
                        flatIndex={flatIndex}
                        isSelected={item === selectedItem}
                        isMobile={isMobile}
                        projectStats={projectStats}
                        showArchived={showArchived}
                        {...(onHover !== undefined ? { onHover } : {})}
                        {...(onActivate !== undefined ? { onActivate } : {})}
                      />
                    )
                  }
                })
            }
          </React.Fragment>
        )
      })}
    </Stack>
  )
}
