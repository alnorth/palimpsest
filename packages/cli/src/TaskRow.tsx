import React from 'react'
import { Text } from 'ink'
import type { Task, ProjectionState } from 'palimpsest'
import { getTaskRowMeta } from 'palimpsest-ui-core'
import { Row } from './Row.js'

interface TaskRowProps {
  task: Task
  isSelected: boolean
  state: ProjectionState
  showProject?: boolean
}

export function TaskRow({ task, isSelected, state, showProject = false }: TaskRowProps) {
  const metaItems = getTaskRowMeta(task, state, { showProject })
  return (
    <Row
      isSelected={isSelected}
      color={isSelected ? 'blue' : undefined}
      twoLine={metaItems.length > 0}
      title={<><Text color="yellow">{task.isNext === true ? '→' : ' '} </Text><Text color="yellow">{task.isStarred === true ? '★ ' : ''}</Text><Text {...(isSelected ? { color: 'blue' as const } : {})}>{task.title}</Text></>}
    >
      {metaItems.map((item, j) => (
        <React.Fragment key={j}>
          {j > 0 && <Text dimColor> · </Text>}
          {item.dueStatus === 'today'
            ? <Text color="green">{item.text}</Text>
            : item.dueStatus === 'overdue'
              ? <Text color="red">{item.text}</Text>
              : <Text dimColor>{item.text}</Text>
          }
        </React.Fragment>
      ))}
    </Row>
  )
}
