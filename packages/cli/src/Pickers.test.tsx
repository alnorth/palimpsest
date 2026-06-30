import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { renderToString } from 'ink'
import type { PickerItem, DueDateOption } from 'palimpsest-ui-core'
import { PickerList, DueDatePicker, ProjectSearch } from './Pickers.js'
import { stripAnsi, lines } from './testUtils.js'

describe('PickerList', () => {
  test('selected item shows > prefix', () => {
    const items: PickerItem<string>[] = [{ label: 'Alpha', value: 'a' }]
    const output = renderToString(<PickerList items={items} selectedItem={items[0]} />, { columns: 80 })
    expect(lines(output)[0]).toMatch(/^> /)
  })

  test('unselected item shows double-space prefix', () => {
    const items: PickerItem<string>[] = [{ label: 'Alpha', value: 'a' }]
    const output = renderToString(<PickerList items={items} selectedItem={undefined} />, { columns: 80 })
    expect(lines(output)[0]).toMatch(/^  /)
  })

  test('item.key shown when present', () => {
    const items: PickerItem<string>[] = [{ label: 'Dashboard', value: 'dashboard', key: 'd' }]
    const output = renderToString(<PickerList items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('d')
  })

  test('item.prefix prepended to label', () => {
    const items: PickerItem<string>[] = [{ label: 'Standup', value: 'x', prefix: '@' }]
    const output = renderToString(<PickerList items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('@Standup')
  })

  test('label rendered for each item', () => {
    const items: PickerItem<string>[] = [
      { label: 'Alpha', value: 'a' },
      { label: 'Beta', value: 'b' },
    ]
    const output = renderToString(<PickerList items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('Alpha')
    expect(stripAnsi(output)).toContain('Beta')
  })
})

describe('DueDatePicker', () => {
  test('non-null value item shows formatted date appended', () => {
    const items: DueDateOption[] = [{ label: 'Tomorrow', value: '2026-07-01T12:00:00.000Z' }]
    const output = renderToString(<DueDatePicker items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('1 Jul')
  })

  test('null value item shows label only (no date suffix)', () => {
    const items: DueDateOption[] = [{ label: 'No due date', value: null }]
    const output = renderToString(<DueDatePicker items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('No due date')
    expect(stripAnsi(output)).not.toContain('—')
  })

  test('"custom" value item shows label only (no date suffix)', () => {
    const items: DueDateOption[] = [{ label: 'Custom…', value: 'custom' }]
    const output = renderToString(<DueDatePicker items={items} selectedItem={undefined} />, { columns: 80 })
    expect(stripAnsi(output)).toContain('Custom…')
    expect(stripAnsi(output)).not.toContain('—')
  })

  test('selected item gets > prefix', () => {
    const items: DueDateOption[] = [{ label: 'Tomorrow', value: '2026-07-01T12:00:00.000Z' }]
    const output = renderToString(<DueDatePicker items={items} selectedItem={items[0]} />, { columns: 80 })
    expect(lines(output)[0]).toMatch(/^> /)
  })
})

describe('ProjectSearch', () => {
  test('shows Search: prompt', () => {
    const output = renderToString(
      <ProjectSearch items={[]} selectedItem={undefined} searchQuery="" onSearchChange={vi.fn()} />,
      { columns: 80 }
    )
    expect(stripAnsi(output)).toContain('Search:')
  })

  test('createLabel defined → shows Create project label, no picker list', () => {
    const output = renderToString(
      <ProjectSearch
        items={[]}
        selectedItem={undefined}
        searchQuery="Website"
        onSearchChange={vi.fn()}
        createLabel="Website"
      />,
      { columns: 80 }
    )
    expect(stripAnsi(output)).toContain('Create project "Website"')
  })

  test('createLabel undefined → shows picker list items', () => {
    const items: PickerItem<unknown>[] = [{ label: 'Existing Project', value: 'p1' }]
    const output = renderToString(
      <ProjectSearch items={items} selectedItem={undefined} searchQuery="" onSearchChange={vi.fn()} />,
      { columns: 80 }
    )
    expect(stripAnsi(output)).toContain('Existing Project')
    expect(stripAnsi(output)).not.toContain('Create project')
  })
})
