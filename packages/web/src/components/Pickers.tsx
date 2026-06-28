import React from 'react'
import { Stack, Group, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { PickerItem, ViewPickerItem, AgendaPickerItem, ContextPickerItem, DueDateOption, ProjectPickerItem, WaitingKindOption, WaitingAgendaPickerItem, WaitingProjectPickerItem } from 'palimpsest-ui-core'

function PickerRow({ isSelected, onMouseEnter, onClick, children }: {
  isSelected: boolean
  onMouseEnter?: (() => void) | undefined
  onClick?: (() => void) | undefined
  children: React.ReactNode
}) {
  return (
    <Group
      px="xs"
      py={2}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        background: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
        borderRadius: 4,
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'monospace',
        userSelect: 'none',
      }}
    >
      {children}
    </Group>
  )
}

function PickerList({ items, selectedIndex, onHover, onActivate }: {
  items: PickerItem<unknown>[]
  selectedIndex: number
  onHover?: ((i: number) => void) | undefined
  onActivate?: ((i: number) => void) | undefined
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const effectiveSelected = isMobile ? -1 : selectedIndex
  return (
    <Stack gap={2}>
      {items.map((item, i) => {
        const isSelected = i === effectiveSelected
        return (
          <PickerRow
            key={i}
            isSelected={isSelected}
            onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined}
            onClick={onActivate !== undefined ? () => onActivate(i) : undefined}
          >
            <Text size="sm" {...(isSelected ? { c: 'blue' } : {})}>
              {isSelected ? '> ' : '  '}{item.prefix}{item.label}
              {item.key !== undefined && <Text span size="xs" c="dimmed">  {item.key}</Text>}
            </Text>
          </PickerRow>
        )
      })}
    </Stack>
  )
}

export function ViewPicker({ items, selectedItem, onHover, onActivate }: { items: ViewPickerItem[]; selectedItem: ViewPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function AgendaPicker({ items, selectedItem, onHover, onActivate }: { items: AgendaPickerItem[]; selectedItem: AgendaPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function WaitingAgendaPicker({ items, selectedItem, onHover, onActivate }: { items: WaitingAgendaPickerItem[]; selectedItem: WaitingAgendaPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function ContextPicker({ items, selectedItem, onHover, onActivate }: { items: ContextPickerItem[]; selectedItem: ContextPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function DueDatePicker({ items, selectedItem, onHover, onActivate }: { items: DueDateOption[]; selectedItem: DueDateOption | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items.map(item => ({
        ...item,
        label: item.value !== null && item.value !== 'custom' ? `${item.label} — ${item.value}` : item.label,
      }))}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function WaitingKindPicker({ items, selectedItem, onHover, onActivate }: { items: WaitingKindOption[]; selectedItem: WaitingKindOption | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <PickerList
      items={items}
      selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
      onHover={onHover}
      onActivate={onActivate}
    />
  )
}

export function ProjectSearch({
  items,
  selectedItem,
  searchQuery,
  onSearchChange,
  onHover,
  onActivate,
}: {
  items: ProjectPickerItem[]
  selectedItem: ProjectPickerItem | undefined
  searchQuery: string
  onSearchChange: (v: string) => void
  onHover?: (i: number) => void
  onActivate?: (i: number) => void
}) {
  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Search projects…"
        value={searchQuery}
        onChange={e => onSearchChange(e.currentTarget.value)}
        autoFocus
        size="sm"
      />
      {items.length === 0 && searchQuery.trim() !== '' ? (
        <PickerRow isSelected onClick={() => onActivate?.(0)}>
          <Text size="sm" c="blue">{'> '}Create project "{searchQuery.trim()}"</Text>
        </PickerRow>
      ) : (
        <PickerList
          items={items}
          selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
          onHover={onHover}
          onActivate={onActivate}
        />
      )}
    </Stack>
  )
}

export function WaitingProjectSearch({
  items,
  selectedItem,
  searchQuery,
  onSearchChange,
  onHover,
  onActivate,
}: {
  items: WaitingProjectPickerItem[]
  selectedItem: WaitingProjectPickerItem | undefined
  searchQuery: string
  onSearchChange: (v: string) => void
  onHover?: (i: number) => void
  onActivate?: (i: number) => void
}) {
  return (
    <Stack gap="sm">
      <TextInput
        placeholder="Search projects…"
        value={searchQuery}
        onChange={e => onSearchChange(e.currentTarget.value)}
        autoFocus
        size="sm"
      />
      <PickerList
        items={items}
        selectedIndex={selectedItem !== undefined ? items.indexOf(selectedItem) : -1}
        onHover={onHover}
        onActivate={onActivate}
      />
    </Stack>
  )
}
