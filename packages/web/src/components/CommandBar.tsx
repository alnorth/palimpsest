import React from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { Command, CommandId } from 'palimpsest-ui-core'

interface Props {
  commands: Partial<Record<CommandId, Command>>
  canGoBack: boolean
}

function CommandGroup({ hints }: { hints: string[] }) {
  if (hints.length === 0) return null
  return (
    <Group gap="lg" wrap="wrap">
      {hints.map(hint => (
        <Text key={hint} size="xs" c="dimmed">{hint}</Text>
      ))}
    </Group>
  )
}

export function CommandBar({ commands, canGoBack }: Props) {
  const allCommands = Object.values(commands)
  const stateCommands = allCommands.filter(c => c.group === 'state')
  const createCommands = allCommands.filter(c => c.group === 'create')
  const viewCommands = allCommands.filter(c => c.group === 'view')
  const navHints = ['↑↓ navigate', ...viewCommands.map(c => `${c.key} ${c.label}`)]
  if (canGoBack) navHints.push('esc back')

  return (
    <Stack gap={2} visibleFrom="sm">
      <CommandGroup hints={stateCommands.map(c => `${c.key} ${c.label}`)} />
      <CommandGroup hints={createCommands.map(c => `${c.key} ${c.label}`)} />
      <CommandGroup hints={navHints} />
    </Stack>
  )
}
