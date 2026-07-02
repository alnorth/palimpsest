import React from 'react'
import { Text } from 'ink'
import type { ListItem, ListGroup, ProjectStats } from 'palimpsest-ui-core'
import type { AgendaId, ProjectionState } from 'palimpsest'
import { TaskRow } from './TaskRow.js'
import { ProjectRow } from './ProjectRow.js'
import { AgendaRow } from './AgendaRow.js'

interface Props {
  groups: ListGroup<ListItem>[]
  selectedItem: ListItem | undefined
  state: ProjectionState
  projectStats: ProjectStats
  agendaStats?: Map<AgendaId, number>
  showProject?: boolean
  showArchived?: boolean
  emptyMessage?: string
}

export function ItemList({ groups, selectedItem, state, projectStats, agendaStats = new Map(), showProject = false, showArchived = false, emptyMessage = 'No items.' }: Props) {
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0)
  if (totalItems === 0) return <Text dimColor>{emptyMessage}</Text>

  return (
    <>
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {group.title !== '' && <Text dimColor bold>{group.title}</Text>}
          {group.items.length === 0
            ? <Text dimColor>  —</Text>
            : group.items.map(item => {
                if (item.kind === 'task') {
                  return <TaskRow key={item.task.id} task={item.task} isSelected={item === selectedItem} state={state} showProject={showProject} />
                } else if (item.kind === 'project') {
                  return <ProjectRow key={item.project.id} project={item.project} isSelected={item === selectedItem} projectStats={projectStats} showArchived={showArchived} />
                } else {
                  return <AgendaRow key={item.agenda.id} agenda={item.agenda} isSelected={item === selectedItem} taskCount={agendaStats.get(item.agenda.id) ?? 0} />
                }
              })
          }
        </React.Fragment>
      ))}
    </>
  )
}
