import React from 'react'
import { Stack, Group, Text, TextInput } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { ViewPickerItem, AgendaPickerItem, ContextPickerItem, DueDateOption, ProjectPickerItem, WaitingKindOption } from 'palimpsest-ui-core'
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

function PickerItem({ i, isActive, prefix = '', label, shortcutKey, onHover, onActivate }: {
  i: number
  isActive: boolean
  prefix?: string | undefined
  label: string
  shortcutKey?: string | undefined
  onHover?: ((i: number) => void) | undefined
  onActivate?: ((i: number) => void) | undefined
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const isSelected = isActive && !isMobile
  return (
    <PickerRow
      isSelected={isSelected}
      onMouseEnter={onHover !== undefined ? () => onHover(i) : undefined}
      onClick={onActivate !== undefined ? () => onActivate(i) : undefined}
    >
      <Text size="sm" {...(isSelected ? { c: 'blue' } : {})}>
        {isSelected ? '> ' : '  '}{prefix}{label}
        {shortcutKey !== undefined && <Text span size="xs" c="dimmed">  {shortcutKey}</Text>}
      </Text>
    </PickerRow>
  )
}

export function ViewPicker({ items, selectedItem, onHover, onActivate }: { items: ViewPickerItem[]; selectedItem: ViewPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerItem key={item.id} i={i} isActive={item === selectedItem} label={item.label} shortcutKey={item.key} onHover={onHover} onActivate={onActivate} />
      ))}
    </Stack>
  )
}

export function AgendaPicker({ items, selectedItem, onHover, onActivate }: { items: AgendaPickerItem[]; selectedItem: AgendaPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerItem key={item.title} i={i} isActive={item === selectedItem} prefix={item.id !== null ? AGENDA_PREFIX : ''} label={item.title} shortcutKey={item.key} onHover={onHover} onActivate={onActivate} />
      ))}
    </Stack>
  )
}

export function ContextPicker({ items, selectedItem, onHover, onActivate }: { items: ContextPickerItem[]; selectedItem: ContextPickerItem | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerItem key={item.name} i={i} isActive={item === selectedItem} prefix={item.id !== null ? CONTEXT_PREFIX : ''} label={item.name} shortcutKey={item.key} onHover={onHover} onActivate={onActivate} />
      ))}
    </Stack>
  )
}

export function DueDatePicker({ items, selectedItem, onHover, onActivate }: { items: DueDateOption[]; selectedItem: DueDateOption | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((opt, i) => {
        const label = opt.date !== null ? `${opt.label} — ${opt.date}` : opt.label
        return (
          <PickerItem key={opt.key} i={i} isActive={opt === selectedItem} label={label} shortcutKey={opt.key} onHover={onHover} onActivate={onActivate} />
        )
      })}
    </Stack>
  )
}

export function WaitingKindPicker({ items, selectedItem, onHover, onActivate }: { items: WaitingKindOption[]; selectedItem: WaitingKindOption | undefined; onHover?: (i: number) => void; onActivate?: (i: number) => void }) {
  return (
    <Stack gap={2}>
      {items.map((item, i) => (
        <PickerItem key={item.kind} i={i} isActive={item === selectedItem} label={item.label} shortcutKey={item.key} onHover={onHover} onActivate={onActivate} />
      ))}
    </Stack>
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
      <Stack gap={2}>
        {items.length === 0 && searchQuery.trim() !== '' ? (
          <PickerRow isSelected onClick={() => onActivate?.(0)}>
            <Text size="sm" c="blue">{'> '}Create project "{searchQuery.trim()}"</Text>
          </PickerRow>
        ) : items.map((p, i) => (
          <PickerItem key={p.id ?? 'null'} i={i} isActive={p === selectedItem} label={p.name} onHover={onHover} onActivate={onActivate} />
        ))}
      </Stack>
    </Stack>
  )
}
