import React from 'react'
import { Stack, Text, Group } from '@mantine/core'
import type { Task } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import type { Action, Command, CommandId } from 'palimpsest-ui-core'
import { getTaskDetailFields } from 'palimpsest-ui-core'
import { CommandButton } from './CommandButton.js'

interface Props {
  task: Task
  state: ProjectionState
  commands?: Partial<Record<CommandId, Command>>
  dispatch?: (action: Action) => void
}

export function TaskDetail({ task, state, commands, dispatch }: Props) {
  const fields = getTaskDetailFields(task, state)

  return (
    <Stack gap="xs" style={{ fontFamily: 'monospace' }}>
      {task.description
        ? <Text size="sm">{task.description}</Text>
        : <Text size="sm" c="dimmed">No description.</Text>
      }
      <Stack gap={2} mt="sm">
        {fields.map((f, i) => (
          <Text key={i} size="sm" c="dimmed">{f.label}{f.value}</Text>
        ))}
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
