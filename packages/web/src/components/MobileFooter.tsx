import React from 'react'
import { Group, Button } from '@mantine/core'
import type { Action, Command, CommandId } from 'palimpsest-ui-core'

interface Props {
  commands: Partial<Record<CommandId, Command>>
  dispatch: (action: Action) => void
}

export function MobileFooter({ commands, dispatch }: Props) {
  const createCommands = Object.values(commands).filter(c => c.group === 'create')

  if (createCommands.length === 0) return null

  return (
    <Group gap="sm" hiddenFrom="sm">
      {createCommands.map(c => (
        <Button
          key={c.id}
          size="xs"
          variant="light"
          onClick={() => dispatch(c.action)}
        >
          + {c.label}
        </Button>
      ))}
    </Group>
  )
}
