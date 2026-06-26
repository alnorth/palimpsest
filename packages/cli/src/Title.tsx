import React from 'react'
import { Text } from 'ink'

interface TitleProps {
  name: string
  subtitle?: string
  children?: React.ReactNode
}

export function Title({ name, subtitle, children }: TitleProps) {
  return (
    <>
      <Text bold color="cyan">{name}</Text>
      {subtitle !== undefined && <Text dimColor> — {subtitle}</Text>}
      {children}
    </>
  )
}
