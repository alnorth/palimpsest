import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useWindowSize } from 'ink'
import { ItemList } from './ItemList.js'
import { Title } from './Title.js'
import { PickerList, DueDatePicker, ProjectSearch } from './Pickers.js'
import TextInput from 'ink-text-input'
import { FilePalimpsestStore, buildStateFromConfig, PALIMPSEST_CONFIG, createEmptyState } from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { useAppState, ClientPalimpsestStore, getDueDatePreview, getRecurrencePreview, handleKey, getTaskDetailFields, isMainListItems } from 'palimpsest-ui-core'
import { handleTaskSubmit, handleEditSubmit, handleEditDescriptionSubmit, handleDueDateSubmit, handleRecurrenceSubmit, handleProjectSubmit, handleEditProjectSubmit } from './submitHandlers.js'
import { TodoistStore } from 'palimpsest-todoist'
import { FilePendingEventStore } from './FilePendingEventStore.js'
import type { View } from 'palimpsest-ui-core'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const todoistToken = process.env['PALIMPSEST_TODOIST_TOKEN']
const apiUrl = process.env['PALIMPSEST_API_URL']
const authToken = process.env['PALIMPSEST_AUTH_TOKEN']

const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

let store: PalimpsestStore
if (todoistToken !== undefined) {
  const pendingPath = join(homedir(), '.palimpsest', 'todoist-pending.json')
  mkdirSync(dirname(pendingPath), { recursive: true })
  store = new TodoistStore(todoistToken, { pendingStore: new FilePendingEventStore(pendingPath), initialState: configState })
} else if (apiUrl !== undefined && authToken !== undefined) {
  const pendingPath = join(homedir(), '.palimpsest', 'pending.json')
  store = new ClientPalimpsestStore(
    async (clientSeq, events) => {
      const res = await fetch(`${apiUrl}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientSeq, events }),
      })
      if (!res.ok) throw new Error(`Sync failed: ${res.status} ${await res.text()}`)
      return res.json() as Promise<any>
    },
    { pendingStore: new FilePendingEventStore(pendingPath), initialState: configState },
  )
} else {
  const filePath = process.env['PALIMPSEST_FILE'] ?? join(homedir(), '.palimpsest', 'events.jsonl')
  mkdirSync(dirname(filePath), { recursive: true })
  store = new FilePalimpsestStore(filePath, configState)
}

function App() {
  const [initialState, setInitialState] = useState<ProjectionState | undefined>(undefined)
  const [initError, setInitError] = useState<string | undefined>(undefined)
  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    let cancelled = false
    store.init()
      .then(() => store.getState())
      .then(state => { if (!cancelled) setInitialState(state) })
      .catch(err => { if (!cancelled) setInitError(err instanceof Error ? err.message : 'Connection failed') })
    return () => { cancelled = true }
  }, [])

  if (initError !== undefined) {
    return (
      <Box flexDirection="column" height={termRows} paddingX={1}>
        <Box paddingTop={1}><Text bold color="cyan">Palimpsest</Text></Box>
        <Box flexGrow={1} flexDirection="column" paddingTop={1}>
          <Text color="red">Error: {initError}</Text>
        </Box>
      </Box>
    )
  }

  if (initialState === undefined) {
    return (
      <Box flexDirection="column" height={termRows} paddingX={1}>
        <Box paddingTop={1}><Text bold color="cyan">Palimpsest</Text></Box>
        <Box flexGrow={1} flexDirection="column" paddingTop={1}>
          <Text dimColor>Connecting…</Text>
        </Box>
      </Box>
    )
  }

  return <LoadedApp initialState={initialState} />
}

function LoadedApp({ initialState }: { initialState: ProjectionState }) {
  const appState = useAppState(store, initialState)
  const {
    view, mode, formValue, activeTask, activeProject, activeAgenda,
    activeSphere, projectStats, agendaStats, listItems, currentTask, selectedItem, selectedProject, spheres, subtitle,
    searchQuery, projState, commands, dispatch, activate, activateSelected, canGoBack, showCompleted, showArchived, showProject,
    syncState,
  } = appState

  const { health: syncHealth, unsyncedCount, pendingConflicts, lastError: lastSyncError } = syncState

  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    process.stdout.write(`\x1b]0;Palimpsest — ${subtitle}\x07`)
    return () => { process.stdout.write('\x1b]0;\x07') }
  }, [subtitle])

  useInput((input, key) => {
    // Map Ink key flags to DOM-style key strings
    const k = key.escape ? 'Escape' : key.upArrow ? 'ArrowUp' : key.downArrow ? 'ArrowDown' : key.return ? 'Enter' : input
    handleKey(k, { mode, listItems, commands, searchQuery, dispatch, activate, activateSelected })
  })

  const _taskSubmit = (title: string) => handleTaskSubmit(title, view, activeProject, activeAgenda, activeSphere, dispatch)
  const _editSubmit = (title: string) => handleEditSubmit(title, currentTask, dispatch)
  const _editDescriptionSubmit = (description: string) => handleEditDescriptionSubmit(description, currentTask, dispatch)
  const _dueDateSubmit = (value: string) => handleDueDateSubmit(value, today, currentTask, dispatch)
  const _recurrenceSubmit = (value: string) => handleRecurrenceSubmit(value, currentTask, dispatch)
  const _projectSubmit = (name: string) => handleProjectSubmit(name, activeSphere, dispatch)
  const _editProjectSubmit = (name: string) => handleEditProjectSubmit(name, selectedProject, dispatch)

  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

  const _dueDatePreview = getDueDatePreview(formValue, today)
  const dueDatePreviewHint: React.ReactNode = _dueDatePreview !== undefined
    ? <Text color={_dueDatePreview.ok ? 'green' : 'red'}>  → {_dueDatePreview.text}</Text>
    : <Text dimColor>  tomorrow · next monday · jul 4 · 2026-12-25</Text>

  const _recurrencePreview = getRecurrencePreview(formValue, today)
  const recurrencePreviewHint: React.ReactNode = _recurrencePreview !== undefined
    ? <Text color={_recurrencePreview.ok ? 'green' : 'red'}>  → {_recurrencePreview.text}</Text>
    : <Text dimColor>  daily · every monday · every 2 weeks · monthly  (empty to clear)</Text>

  let title: React.ReactNode
  let content: React.ReactNode
  let footer: React.ReactNode

  const allCommands = Object.values(commands)
  const stateCommands = allCommands.filter(c => c.group === 'state')
  const createCommands = allCommands.filter(c => c.group === 'create')
  const viewCommands = allCommands.filter(c => c.group === 'view')

  if (listItems.view === 'picking-due-date') {
    title = <Text bold color="cyan">{subtitle}</Text>
    if (mode?.type === 'editing-due-date') {
      content = (
        <Box flexDirection="column">
          <Box>
            <Text>Due date: </Text>
            <TextInput value={formValue} onChange={v => dispatch({ type: 'update-mode', formValue: v })} onSubmit={_dueDateSubmit} />
          </Box>
          {dueDatePreviewHint}
        </Box>
      )
      footer = <Text dimColor>enter to set  esc cancel</Text>
    } else {
      content = <DueDatePicker items={listItems.items} selectedItem={listItems.selectedItem} />
      footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
    }
  } else if (
    listItems.view === 'picking-agenda-for-task' ||
    listItems.view === 'picking-context-for-task' ||
    listItems.view === 'picking-waiting-for-task' ||
    listItems.view === 'picking-waiting-agenda' ||
    listItems.view === 'picking-view'
  ) {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = <PickerList items={listItems.items} selectedItem={listItems.selectedItem} />
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-waiting-project') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = (
      <ProjectSearch
        items={listItems.items}
        selectedItem={listItems.selectedItem}
        searchQuery={searchQuery}
        onSearchChange={v => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
      />
    )
    footer = <Text dimColor>type to search  ↑↓ navigate  enter select  esc back</Text>
  } else if (listItems.view === 'picking-project-for-task') {
    title = <Text bold color="cyan">{subtitle}</Text>
    const createLabel = listItems.items.length === 0 && searchQuery.trim() !== '' ? searchQuery.trim() : undefined
    content = (
      <ProjectSearch
        items={listItems.items}
        selectedItem={listItems.selectedItem}
        searchQuery={searchQuery}
        onSearchChange={v => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
        createLabel={createLabel}
      />
    )
    footer = <Text dimColor>type to search  ↑↓ navigate  enter select  esc back</Text>
  } else {
    const completedTag = showCompleted && view !== 'projects' ? <Text color="yellow"> completed</Text> : null
    const archivedTag = showArchived && view === 'projects' ? <Text color="yellow"> archived</Text> : null
    const viewItems = ['↑↓ navigate', ...viewCommands.map(c => `${c.key} ${c.label}`)]
    if (canGoBack) viewItems.push('esc back')
    const listHint = (
      <Box flexDirection="column">
        {stateCommands.length > 0 && (
          <Box flexWrap="wrap">
            {stateCommands.map(c => (
              <Box key={c.key} marginRight={2} flexShrink={0}>
                <Text dimColor>{c.key} {c.label}</Text>
              </Box>
            ))}
          </Box>
        )}
        {createCommands.length > 0 && (
          <Box flexWrap="wrap">
            {createCommands.map(c => (
              <Box key={c.key} marginRight={2} flexShrink={0}>
                <Text dimColor>{c.key} {c.label}</Text>
              </Box>
            ))}
          </Box>
        )}
        <Box flexWrap="wrap">
          {viewItems.map(item => (
            <Box key={item} marginRight={2} flexShrink={0}>
              <Text dimColor>{item}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
    title = <Title name={activeSphere?.name ?? 'Palimpsest'} subtitle={subtitle}>{archivedTag}{completedTag}</Title>
    content = activeSphere === undefined ? (
      <Text dimColor>No spheres configured — edit PALIMPSEST_CONFIG in packages/core/src/config.ts.</Text>
    ) : listItems.view === 'task' ? (() => {
      const detailFields = activeTask !== undefined ? getTaskDetailFields(activeTask, projState) : []
      return (
        <Box flexDirection="column">
          {activeTask?.description
            ? <Text>{activeTask.description}</Text>
            : <Text dimColor>No description.</Text>
          }
          <Box flexDirection="column" marginTop={1}>
            {detailFields.map((f, i) => (
              <Text key={i} dimColor>{f.label}{f.value}</Text>
            ))}
          </Box>
        </Box>
      )
    })() : isMainListItems(listItems) ? (
      <ItemList
        groups={listItems.groups}
        selectedItem={selectedItem}
        state={projState}
        projectStats={projectStats}
        agendaStats={agendaStats}
        showProject={showProject}
        showArchived={showArchived}
        emptyMessage={listItems.emptyMessage}
      />
    ) : null
    const onChangeFormValue = (v: string) => dispatch({ type: 'update-mode', formValue: v })
    footer = mode?.type === 'adding' ? (
      activeSphere === undefined ? (
        <Text color="red">No spheres found — create a sphere first.</Text>
      ) : (
        <Box>
          <Text>New task: </Text>
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_taskSubmit} />
        </Box>
      )
    ) : mode?.type === 'editing-task' ? (
      <Box>
        <Text>Edit task: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_editSubmit} />
      </Box>
    ) : mode?.type === 'editing-description' ? (
      <Box>
        <Text>Description: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_editDescriptionSubmit} />
      </Box>
    ) : mode?.type === 'editing-recurrence' ? (
      <Box flexDirection="column">
        <Box>
          <Text>Recurring: </Text>
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_recurrenceSubmit} />
        </Box>
        {recurrencePreviewHint}
      </Box>
    ) : mode?.type === 'adding-project' ? (
      activeSphere === undefined ? (
        <Text color="red">No spheres found — create a sphere first.</Text>
      ) : (
        <Box>
          <Text>New project: </Text>
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_projectSubmit} />
        </Box>
      )
    ) : mode?.type === 'editing-project' ? (
      <Box>
        <Text>Edit project: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={_editProjectSubmit} />
      </Box>
    ) : listHint
  }

  const syncRow = syncHealth === 'error' ? (
    <Text color="red">sync error: {lastSyncError ?? 'unknown'} — changes saved locally, will retry</Text>
  ) : syncHealth === 'conflict' ? (
    <Text color="red">conflict: {pendingConflicts[0]?.reason ?? 'unknown'}</Text>
  ) : unsyncedCount > 0 ? (
    <Text dimColor>{unsyncedCount} unsynced</Text>
  ) : null

  return (
    <Box flexDirection="column" height={termRows} paddingX={1}>
      <Box paddingTop={1}>{title}</Box>
      <Box flexGrow={1} flexDirection="column" paddingTop={1} overflow="hidden">
        {content}
      </Box>
      {syncRow !== null && <Box>{syncRow}</Box>}
      <Box paddingBottom={1}>{footer}</Box>
    </Box>
  )
}

render(<App />, { alternateScreen: true })
