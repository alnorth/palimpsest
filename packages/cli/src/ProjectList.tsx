import React from 'react'
import { Text } from 'ink'
import type { Project } from 'palimpsest'
import type { ProjectStats, ListGroup } from 'palimpsest-ui-core'
import { ProjectRow } from './ProjectRow.js'

interface Props {
  groups: ListGroup<Project>[]
  selected: number
  projectStats: ProjectStats
  showArchived?: boolean
  emptyMessage?: string
}

export function ProjectList({ groups, selected, projectStats, showArchived = false, emptyMessage = 'No projects.' }: Props) {
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
  if (totalItems === 0) return <Text dimColor>{emptyMessage}</Text>

  let offset = 0
  return (
    <>
      {groups.map((group, gi) => {
        const groupOffset = offset
        offset += group.items.length
        return (
          <React.Fragment key={gi}>
            {group.title !== '' && <Text dimColor bold>{group.title}</Text>}
            {group.items.map((project, i) => {
              const flatIndex = groupOffset + i
              return <ProjectRow key={project.id} project={project} isSelected={flatIndex === selected} projectStats={projectStats} showArchived={showArchived} />
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}
