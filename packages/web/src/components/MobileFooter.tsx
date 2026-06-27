import React from 'react'
import { Group } from '@mantine/core'
import type { Action, Command, CommandId } from 'palimpsest-ui-core'
import { CommandButton } from './CommandButton.js'

interface Props {
  commands: Partial<Record<CommandId, Command>>
  dispatch: (action: Action) => void
}

export function MobileFooter({ commands, dispatch }: Props) {
  const createCommands = (Object.values(commands) as (Command | undefined)[]).filter((c): c is Command => c !== undefined && c.group === 'create')

  if (createCommands.length === 0) return null

  return (
    <Group gap="sm" hiddenFrom="sm">
      {createCommands.map(c => (
        <CommandButton key={c.id} command={c} dispatch={dispatch} />
      ))}
    </Group>
  )
}
