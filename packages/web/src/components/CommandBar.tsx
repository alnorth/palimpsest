import React from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { Command, CommandId } from 'palimpsest-ui-core'

interface Props {
  commands: Partial<Record<CommandId, Command>>
  canGoBack: boolean
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
      {stateCommands.length > 0 && (
        <Group gap="lg" wrap="wrap">
          {stateCommands.map(c => (
            <Text key={c.key} size="xs" c="dimmed">{c.key} {c.label}</Text>
          ))}
        </Group>
      )}
      {createCommands.length > 0 && (
        <Group gap="lg" wrap="wrap">
          {createCommands.map(c => (
            <Text key={c.key} size="xs" c="dimmed">{c.key} {c.label}</Text>
          ))}
        </Group>
      )}
      <Group gap="lg" wrap="wrap">
        {navHints.map(hint => (
          <Text key={hint} size="xs" c="dimmed">{hint}</Text>
        ))}
      </Group>
    </Stack>
  )
}
