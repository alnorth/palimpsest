import React from 'react'
import { describe, test, expect } from 'vitest'
import { Text, renderToString } from 'ink'
import { Title } from './Title.js'
import { stripAnsi } from './testUtils.js'

describe('Title', () => {
  test('renders the name', () => {
    const output = renderToString(<Title name="Palimpsest" />, { columns: 80 })
    expect(stripAnsi(output)).toContain('Palimpsest')
  })

  test('renders the subtitle with — separator when provided', () => {
    const output = renderToString(<Title name="Palimpsest" subtitle="Tasks" />, { columns: 80 })
    expect(stripAnsi(output)).toContain('Palimpsest')
    expect(stripAnsi(output)).toContain('—')
    expect(stripAnsi(output)).toContain('Tasks')
  })

  test('no — when subtitle is omitted', () => {
    const output = renderToString(<Title name="Palimpsest" />, { columns: 80 })
    expect(stripAnsi(output)).not.toContain('—')
  })

  test('renders children', () => {
    const output = renderToString(
      <Title name="Palimpsest"><Text> [extra]</Text></Title>,
      { columns: 80 }
    )
    expect(stripAnsi(output)).toContain('[extra]')
  })
})
