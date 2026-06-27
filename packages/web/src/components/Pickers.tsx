import React from 'react'
import { Stack, Group, Text, TextInput } from '@mantine/core'
import type { ViewPickerItem, AgendaPickerItem, ContextPickerItem, DueDateOption, ProjectPickerItem } from 'palimpsest-ui-core'
import { AGENDA_PREFIX, CONTEXT_PREFIX } from 'palimpsest-ui-core'

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

export function ViewPicker({ items, selected, onHover, onActivate }: { items: ViewPickerItem[]; selected: number; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerRow key={item.id} isSelected={i === selected} onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined} onClick={onActivate !== undefined ? () => onActivate(i) : undefined}>
          <Text size="sm" {...(i === selected ? { c: 'blue' } : {})}>
            {i === selected ? '> ' : '  '}{item.label}
            <Text span size="xs" c="dimmed">  {item.key}</Text>
          </Text>
        </PickerRow>
      ))}
    </Stack>
  )
}

export function AgendaPicker({ items, selected, onHover, onActivate }: { items: AgendaPickerItem[]; selected: number; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerRow key={item.title} isSelected={i === selected} onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined} onClick={onActivate !== undefined ? () => onActivate(i) : undefined}>
          <Text size="sm" {...(i === selected ? { c: 'blue' } : {})}>
            {i === selected ? '> ' : '  '}{item.id !== null ? AGENDA_PREFIX : ''}{item.title}
            {item.key !== undefined && <Text span size="xs" c="dimmed">  {item.key}</Text>}
          </Text>
        </PickerRow>
      ))}
    </Stack>
  )
}

export function ContextPicker({ items, selected, onHover, onActivate }: { items: ContextPickerItem[]; selected: number; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerRow key={item.name} isSelected={i === selected} onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined} onClick={onActivate !== undefined ? () => onActivate(i) : undefined}>
          <Text size="sm" {...(i === selected ? { c: 'blue' } : {})}>
            {i === selected ? '> ' : '  '}{item.id !== null ? CONTEXT_PREFIX : ''}{item.name}
            {item.key !== undefined && <Text span size="xs" c="dimmed">  {item.key}</Text>}
          </Text>
        </PickerRow>
      ))}
    </Stack>
  )
}

export function DueDatePicker({ items, selected, onHover, onActivate }: { items: DueDateOption[]; selected: number; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((opt, i) => {
        const label = opt.date !== null ? `${opt.label} — ${opt.date}` : opt.label
        return (
          <PickerRow key={opt.key} isSelected={i === selected} onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined} onClick={onActivate !== undefined ? () => onActivate(i) : undefined}>
            <Text size="sm" {...(i === selected ? { c: 'blue' } : {})}>
              {i === selected ? '> ' : '  '}{label}
              <Text span size="xs" c="dimmed">  {opt.key}</Text>
            </Text>
          </PickerRow>
        )
      })}
    </Stack>
  )
}

export function ProjectSearch({
  items,
  selected,
  searchQuery,
  onSearchChange,
  onHover,
  onActivate,
}: {
  items: ProjectPickerItem[]
  selected: number
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
      <Stack gap={2}>
        {items.length === 0 && searchQuery.trim() !== '' ? (
          <PickerRow isSelected onClick={() => onActivate?.(0)}>
            <Text size="sm" c="blue">{'> '}Create project "{searchQuery.trim()}"</Text>
          </PickerRow>
        ) : items.map((p, i) => (
          <PickerRow key={p.id ?? 'null'} isSelected={i === selected} onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined} onClick={onActivate !== undefined ? () => onActivate(i) : undefined}>
            <Text size="sm" {...(i === selected ? { c: 'blue' } : {})}>
              {i === selected ? '> ' : '  '}{p.name}
            </Text>
          </PickerRow>
        ))}
      </Stack>
    </Stack>
  )
}
