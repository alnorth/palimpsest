import React from 'react'
import { Box, Text } from 'ink'

type Props =
  | { isSelected: boolean; color: 'blue' | 'red' | undefined; dimColor?: boolean; title: React.ReactNode; children?: React.ReactNode; twoLine?: false }
  | { isSelected: boolean; color: 'blue' | 'red' | undefined; dimColor?: boolean; title: React.ReactElement; children?: React.ReactNode; twoLine: true }

export function Row({ isSelected, color, dimColor, title, children, twoLine }: Props) {
  if (twoLine === true) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text {...(color !== undefined ? { color } : {})} dimColor={dimColor === true}>
            {isSelected ? '> ' : '  '}
          </Text>
          {title}
        </Box>
        <Box marginLeft={4}>{children}</Box>
      </Box>
    )
  }
  return (
    <Box marginBottom={1}>
      <Text {...(color !== undefined ? { color } : {})} dimColor={dimColor === true}>
        {isSelected ? '> ' : '  '}{title}
      </Text>
      {children}
    </Box>
  )
}

export function Meta({ children }: { children: React.ReactNode }) {
  return <Text dimColor> · {children}</Text>
}
