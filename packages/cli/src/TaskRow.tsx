import React from 'react'
import { Text } from 'ink'
import { getProject, getAgenda, getContext } from 'palimpsest'
import type { Task, ProjectionState } from 'palimpsest'
import { AGENDA_PREFIX, PROJECT_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from 'palimpsest-ui-core'
import { Row } from './Row.js'
import { formatDateTime, dueDateColor } from './format.js'

interface TaskRowProps {
  task: Task
  isSelected: boolean
  state: ProjectionState
  showProject?: boolean
}

export function TaskRow({ task, isSelected, state, showProject = false }: TaskRowProps) {
  const project = showProject && task.projectId !== undefined ? getProject(state, task.projectId) : undefined
  const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
  const context = task.contextId !== undefined ? getContext(state, task.contextId) : undefined
  const ddColor = task.dueDate !== undefined ? dueDateColor(task.dueDate) : undefined
  const metaItems: React.ReactNode[] = []
  if (task.description) metaItems.push(<Text dimColor>¶</Text>)
  if (task.waitingFor !== undefined) {
    const wf = task.waitingFor
    let label: string
    if (wf.kind === 'review') {
      label = 'w/ review'
    } else if (wf.kind === 'agenda') {
      const a = getAgenda(state, wf.agendaId)
      label = a !== undefined ? `w/ ${AGENDA_PREFIX}${a.title}` : 'w/ agenda'
    } else {
      const p = getProject(state, wf.projectId)
      label = p !== undefined ? `w/ ${PROJECT_PREFIX}${p.name}` : 'w/ project'
    }
    metaItems.push(<Text dimColor>{label}</Text>)
  }
  if (project !== undefined) metaItems.push(<Text dimColor>{PROJECT_PREFIX}{project.name}</Text>)
  if (agenda !== undefined) metaItems.push(<Text dimColor>{AGENDA_PREFIX}{agenda.title}</Text>)
  if (context !== undefined) metaItems.push(<Text dimColor>{CONTEXT_PREFIX}{context.name}</Text>)
  if (task.dueDate !== undefined) metaItems.push(<Text {...(ddColor !== undefined ? { color: ddColor } : { dimColor: true })}>{task.dueDate}</Text>)
  if (task.dueDateExpression !== undefined) metaItems.push(<Text dimColor>{RECURRENCE_PREFIX} {task.dueDateExpression}</Text>)
  if (task.completedAt !== undefined) metaItems.push(<Text dimColor>{formatDateTime(task.completedAt)}</Text>)
  return (
    <Row
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
}
