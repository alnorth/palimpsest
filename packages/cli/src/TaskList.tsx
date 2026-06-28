import React from 'react'
import { Text } from 'ink'
import { getProject, getAgenda, getContext } from 'palimpsest'
import type { Task, ProjectionState } from 'palimpsest'
import { AGENDA_PREFIX, PROJECT_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from 'palimpsest-ui-core'
import type { ListGroup } from 'palimpsest-ui-core'
import { Row } from './Row.js'
import { formatDateTime, dueDateColor } from './format.js'

interface Props {
  groups: ListGroup<Task>[]
  selected: number
  state: ProjectionState
  showProject?: boolean
  emptyMessage?: string
}

export function TaskList({ groups, selected, state, showProject = false, emptyMessage = 'No open tasks.' }: Props) {
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
            {group.items.map((task, i) => {
              const flatIndex = groupOffset + i
              const project = showProject && task.projectId !== undefined ? getProject(state, task.projectId) : undefined
              const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
              const context = task.contextId !== undefined ? getContext(state, task.contextId) : undefined
              const isSelected = flatIndex === selected
              const ddColor = task.dueDate !== undefined ? dueDateColor(task.dueDate) : undefined
              const metaItems: React.ReactNode[] = []
              if (task.description) metaItems.push(<Text dimColor>¶</Text>)
              if (task.isWaiting === true) metaItems.push(<Text dimColor>Waiting</Text>)
              if (project !== undefined) metaItems.push(<Text dimColor>{PROJECT_PREFIX}{project.name}</Text>)
              if (agenda !== undefined) metaItems.push(<Text dimColor>{AGENDA_PREFIX}{agenda.title}</Text>)
              if (context !== undefined) metaItems.push(<Text dimColor>{CONTEXT_PREFIX}{context.name}</Text>)
              if (task.dueDate !== undefined) metaItems.push(<Text {...(ddColor !== undefined ? { color: ddColor } : { dimColor: true })}>{task.dueDate}</Text>)
              if (task.dueDateExpression !== undefined) metaItems.push(<Text dimColor>{RECURRENCE_PREFIX} {task.dueDateExpression}</Text>)
              if (task.completedAt !== undefined) metaItems.push(<Text dimColor>{formatDateTime(task.completedAt)}</Text>)
              return (
                <Row
                  key={task.id}
                  isSelected={isSelected}
                  color={isSelected ? 'blue' : undefined}
                  twoLine={metaItems.length > 0}
                  title={<><Text color="yellow">{task.isNext === true ? '→' : ' '} </Text><Text color="yellow">{task.isStarred === true ? '★ ' : ''}</Text>{task.title}</>}
                >
                  {metaItems.map((item, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <Text dimColor> · </Text>}
                      {item}
                    </React.Fragment>
                  ))}
                </Row>
              )
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}
