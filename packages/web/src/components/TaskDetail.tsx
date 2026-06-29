import React from 'react'
import { Stack, Text, Group, Anchor } from '@mantine/core'
import type { Task } from 'palimpsest'
import type { ProjectionState } from 'palimpsest'
import type { Action, Command, CommandId } from 'palimpsest-ui-core'
import { getTaskDetailFields } from 'palimpsest-ui-core'
import { CommandButton } from './CommandButton.js'

const URL_REGEX = /https?:\/\/[^\s]+/g

function DescriptionText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const url = match[0]
    parts.push(<Anchor key={match.index} href={url} target="_blank" rel="noopener noreferrer" size="sm">{url}</Anchor>)
    last = match.index + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <Text size="sm">{parts}</Text>
}

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
        ? <DescriptionText text={task.description} />
        : <Text size="sm" c="dimmed">No description.</Text>
      }
      <Stack gap={2} mt="sm">
        {fields.map((f, i) => (
          <Text key={i} size="sm" c="dimmed">{f.label}{f.href !== undefined
            ? <Anchor href={f.href} target="_blank" rel="noopener noreferrer" size="sm">{f.value}</Anchor>
            : f.value}</Text>
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
