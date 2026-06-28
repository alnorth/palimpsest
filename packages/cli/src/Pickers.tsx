import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type { PickerItem, DueDateOption } from 'palimpsest-ui-core'
import { formatDate } from './format.js'

export function PickerList({ items, selectedItem }: {
  items: PickerItem<unknown>[]
  selectedItem: PickerItem<unknown> | undefined
}) {
  return (
    <>
      {items.map((item, i) => {
        const isSelected = item === selectedItem
        return (
          <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
            {isSelected ? '> ' : '  '}{item.prefix ?? ''}{item.label}
            {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
          </Text>
        )
      })}
    </>
  )
}

export function DueDatePicker({ items, selectedItem }: {
  items: DueDateOption[]
  selectedItem: DueDateOption | undefined
}) {
  return (
    <>
      {items.map((item, i) => {
        const isSelected = item === selectedItem
        const label = item.value !== null && item.value !== 'custom'
          ? `${item.label} — ${formatDate(item.value)}`
          : item.label
        return (
          <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
            {isSelected ? '> ' : '  '}{label}
            {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
          </Text>
        )
      })}
    </>
  )
}

export function ProjectSearch({ items, selectedItem, searchQuery, onSearchChange, createLabel }: {
  items: PickerItem<unknown>[]
  selectedItem: PickerItem<unknown> | undefined
  searchQuery: string
  onSearchChange: (v: string) => void
  createLabel?: string | undefined
}) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>Search: </Text>
        <TextInput value={searchQuery} onChange={onSearchChange} onSubmit={() => {}} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {createLabel !== undefined ? (
          <Text color="blue">{'> '}Create project "{createLabel}"</Text>
        ) : (
          <PickerList items={items} selectedItem={selectedItem} />
        )}
      </Box>
    </Box>
  )
}
