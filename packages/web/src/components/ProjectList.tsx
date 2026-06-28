import React from 'react'
import { Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { Project } from 'palimpsest'
import type { ProjectStats, ListGroup } from 'palimpsest-ui-core'
import { ProjectRow } from './ProjectRow.js'

interface Props {
  groups: ListGroup<Project>[]
  selected: number
  projectStats: ProjectStats
  showArchived: boolean
  emptyMessage?: string
  onHover?: (index: number) => void
  onActivate?: (index: number) => void
}

export function ProjectList({ groups, selected, projectStats, showArchived, emptyMessage, onHover, onActivate }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)') ?? false
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
              return (
                <ProjectRow
                  key={project.id}
                  project={project}
                  flatIndex={flatIndex}
                  isSelected={flatIndex === selected}
                  isMobile={isMobile}
                  projectStats={projectStats}
                  showArchived={showArchived}
                  {...(onHover !== undefined ? { onHover } : {})}
                  {...(onActivate !== undefined ? { onActivate } : {})}
                />
              )
            })}
          </React.Fragment>
        )
      })}
    </Stack>
  )
}
