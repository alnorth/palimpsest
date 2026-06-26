import React from 'react'
import { Group, Text, TextInput } from '@mantine/core'
import type { Command } from 'palimpsest-ui-core'
import type { Mode } from 'palimpsest-ui-core'

interface Props {
  mode: Mode
  commands: Command[]
  canGoBack: boolean
  formValue: string
  onFormChange: (v: string) => void
  onFormSubmit: (v: string) => void
}

export function CommandBar({ mode, commands, canGoBack, formValue, onFormChange, onFormSubmit }: Props) {
  if (mode === 'adding') {
    return (
      <TextInput
        label="New task"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'editing-task') {
    return (
      <TextInput
        label="Edit task"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'editing-description') {
    return (
      <TextInput
        label="Description"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'editing-due-date') {
    return (
      <TextInput
        label="Due date"
        placeholder="tomorrow · next monday · jul 4 · 2026-12-25"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'editing-recurrence') {
    return (
      <TextInput
        label="Recurrence"
        placeholder="daily · every monday · every 2 weeks · monthly"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'adding-project') {
    return (
      <TextInput
        label="New project"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }
  if (mode === 'editing-project') {
    return (
      <TextInput
        label="Edit project"
        value={formValue}
        onChange={e => onFormChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onFormSubmit(formValue); e.preventDefault() } }}
        autoFocus
        size="sm"
      />
    )
  }

  const stateCommands = commands.filter(c => c.group === 'state')
  const viewCommands = commands.filter(c => c.group === 'view')
  const navHints = ['↑↓ navigate', ...viewCommands.map(c => `${c.key} ${c.label}`)]
  if (canGoBack) navHints.push('esc back')

  return (
    <Group gap="lg" wrap="wrap">
      {stateCommands.map(c => (
        <Text key={c.key} size="xs" c="dimmed">{c.key} {c.label}</Text>
      ))}
      {navHints.map(hint => (
        <Text key={hint} size="xs" c="dimmed">{hint}</Text>
      ))}
    </Group>
  )
}
