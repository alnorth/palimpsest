import React from 'react'
import { Button } from '@mantine/core'
import type { Action, Command } from 'palimpsest-ui-core'

interface Props {
  command: Command
  dispatch: (action: Action) => void
}

export function CommandButton({ command, dispatch }: Props) {
  return (
    <Button
      size="xs"
      variant="light"
      onClick={() => dispatch(command.action)}
      style={{ fontFamily: 'monospace' }}
    >
      {command.label}
    </Button>
  )
}
