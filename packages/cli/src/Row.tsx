import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  isSelected: boolean
  color: 'blue' | 'red' | undefined
  dimColor?: boolean
  title: React.ReactNode
  children?: React.ReactNode
}

export function Row({ isSelected, color, dimColor, title, children }: Props) {
  return (
    <Box>
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
