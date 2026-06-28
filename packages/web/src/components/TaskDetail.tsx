import React from 'react'
import { Stack, Text, Group } from '@mantine/core'
import type { Task } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import { getProject, getAgenda, getContext } from 'palimpsest'
import type { Action, Command, CommandId } from 'palimpsest-ui-core'
import { PROJECT_PREFIX, AGENDA_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from 'palimpsest-ui-core'
import { CommandButton } from './CommandButton.js'

interface Props {
  task: Task
  state: ProjectionState
  commands?: Partial<Record<CommandId, Command>>
  dispatch?: (action: Action) => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function TaskDetail({ task, state, commands, dispatch }: Props) {
  const project = task.projectId !== undefined ? getProject(state, task.projectId) : undefined
  const agenda = task.agendaId !== undefined ? getAgenda(state, task.agendaId) : undefined
  const context = task.contextId !== undefined ? getContext(state, task.contextId) : undefined

  return (
    <Stack gap="xs" style={{ fontFamily: 'monospace' }}>
      {task.description
        ? <Text size="sm">{task.description}</Text>
        : <Text size="sm" c="dimmed">No description.</Text>
      }
      <Stack gap={2} mt="sm">
        {project !== undefined && <Text size="sm" c="dimmed">project    {PROJECT_PREFIX}{project.name}</Text>}
        {agenda !== undefined && <Text size="sm" c="dimmed">agenda     {AGENDA_PREFIX}{agenda.title}</Text>}
        {context !== undefined && <Text size="sm" c="dimmed">context    {CONTEXT_PREFIX}{context.name}</Text>}
        {task.dueDate !== undefined && <Text size="sm" c="dimmed">due        {task.dueDate}</Text>}
        {task.dueDateExpression !== undefined && <Text size="sm" c="dimmed">recurring  {RECURRENCE_PREFIX} {task.dueDateExpression}</Text>}
        {task.completedAt !== undefined && <Text size="sm" c="dimmed">completed  {formatDateTime(task.completedAt)}</Text>}
        {task.isNext === true && <Text size="sm" c="dimmed">next action</Text>}
        {task.isStarred === true && <Text size="sm" c="dimmed">starred</Text>}
        {task.waitingFor !== undefined && (
          <Text size="sm" c="dimmed">
            waiting    {task.waitingFor.kind === 'review' ? 'for review' : `for ${task.waitingFor.kind}`}
          </Text>
        )}
      </Stack>
      {commands !== undefined && dispatch !== undefined && (Object.values(commands) as Command[]).some(c => c.group === 'state') && (
        <Group gap="xs" mt="md" wrap="wrap">
          {(Object.values(commands) as Command[]).filter(c => c.group === 'state').map(c => (
            <CommandButton key={c.id} command={c} dispatch={dispatch} />
          ))}
        </Group>
      )}
    </Stack>
  )
}
