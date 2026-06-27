import React from 'react'
import { Box, Text, useWindowSize } from 'ink'

interface Props {
  isSelected: boolean
  color: 'blue' | 'red' | undefined
  dimColor?: boolean
  title: React.ReactNode
  children?: React.ReactNode
  twoLine?: boolean
}

export function Row({ isSelected, color, dimColor, title, children, twoLine }: Props) {
  const { columns } = useWindowSize()
  const isMobile = columns < 60
  const caret = isMobile ? '' : (isSelected ? '> ' : '  ')
  if (twoLine === true) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text {...(color !== undefined ? { color } : {})} dimColor={dimColor === true}>
            {caret}{title}
          </Text>
        </Box>
        <Box marginLeft={isMobile ? 0 : 4}>{children}</Box>
      </Box>
    )
  }
  return (
    <Box marginBottom={1}>
      <Text {...(color !== undefined ? { color } : {})} dimColor={dimColor === true}>
        {caret}{title}
      </Text>
      {children}
    </Box>
  )
}

export function Meta({ children }: { children: React.ReactNode }) {
  return <Text dimColor> · {children}</Text>
}
