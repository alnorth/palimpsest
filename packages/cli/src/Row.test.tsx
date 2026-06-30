import React from 'react'
import { describe, test, expect } from 'vitest'
import { Text, renderToString } from 'ink'
import { Row } from './Row.js'

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

function lines(output: string): string[] {
  return stripAnsi(output).split('\n')
}

describe('Row', () => {
  describe('single-line (twoLine=false)', () => {
    test('renders title text', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} title="my task" />,
        { columns: 80 }
      )
      expect(stripAnsi(output)).toContain('my task')
    })

    test('unselected shows double-space prefix', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} title="task" />,
        { columns: 80 }
      )
      expect(lines(output)[0]).toMatch(/^  /)
    })

    test('selected shows > prefix', () => {
      const output = renderToString(
        <Row isSelected={true} color="blue" title="task" />,
        { columns: 80 }
      )
      expect(lines(output)[0]).toMatch(/^> /)
    })

    test('children render on same line', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} title="task">
          <Text dimColor>extra</Text>
        </Row>,
        { columns: 80 }
      )
      const titleLine = lines(output).findIndex(l => l.includes('task'))
      const extraLine = lines(output).findIndex(l => l.includes('extra'))
      expect(titleLine).toBeGreaterThanOrEqual(0)
      expect(extraLine).toBe(titleLine)
    })

    test('blank line after (marginBottom=1)', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} title="task" />,
        { columns: 80 }
      )
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('task'))
      expect(ls[titleLine + 1]?.trim()).toBe('')
    })
  })

  describe('two-line (twoLine=true)', () => {
    test('renders title text', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<Text>my task</Text>}>
          <Text dimColor>meta</Text>
        </Row>,
        { columns: 80 }
      )
      expect(stripAnsi(output)).toContain('my task')
    })

    test('title and meta appear on separate consecutive lines', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<Text>my task</Text>}>
          <Text dimColor>2026-07-01</Text>
        </Row>,
        { columns: 80 }
      )
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('my task'))
      const metaLine  = ls.findIndex(l => l.includes('2026-07-01'))
      expect(titleLine).toBeGreaterThanOrEqual(0)
      expect(metaLine).toBe(titleLine + 1)
    })

    test('meta does not appear on the same line as title', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<Text>my task</Text>}>
          <Text dimColor>2026-07-01</Text>
        </Row>,
        { columns: 80 }
      )
      const ls = lines(output)
      const titleLine = ls.findIndex(l => l.includes('my task'))
      expect(ls[titleLine]).not.toContain('2026-07-01')
    })

    test('unselected shows double-space prefix on title line', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<Text>task</Text>}>
          <Text dimColor>meta</Text>
        </Row>,
        { columns: 80 }
      )
      const titleLine = lines(output).findIndex(l => l.includes('task'))
      expect(lines(output)[titleLine]).toMatch(/^  /)
    })

    test('selected shows > prefix on title line', () => {
      const output = renderToString(
        <Row isSelected={true} color="blue" twoLine={true}
          title={<Text>task</Text>}>
          <Text dimColor>meta</Text>
        </Row>,
        { columns: 80 }
      )
      const titleLine = lines(output).findIndex(l => l.includes('task'))
      expect(lines(output)[titleLine]).toMatch(/^> /)
    })

    test('blank line after meta (marginBottom=1)', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<Text>task</Text>}>
          <Text dimColor>meta</Text>
        </Row>,
        { columns: 80 }
      )
      const ls = lines(output)
      const metaLine = ls.findIndex(l => l.includes('meta'))
      expect(ls[metaLine + 1]?.trim()).toBe('')
    })

    test('title with nested Text elements stays on one line', () => {
      const output = renderToString(
        <Row isSelected={false} color={undefined} twoLine={true}
          title={<><Text color="yellow">→ </Text><Text>A long task title</Text></>}>
          <Text dimColor>2026-07-01</Text>
        </Row>,
        { columns: 80 }
      )
      const ls = lines(output)
      const metaLine  = ls.findIndex(l => l.includes('2026-07-01'))
      const arrowLine = ls.findIndex(l => l.includes('→'))
      const titleLine = ls.findIndex(l => l.includes('A long task title'))
      expect(arrowLine).toBe(titleLine)
      expect(metaLine).toBe(titleLine + 1)
    })
  })
})
