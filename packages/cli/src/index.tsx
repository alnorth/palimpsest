import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useWindowSize } from 'ink'
import { ItemList } from './ItemList.js'
import { Title } from './Title.js'
import TextInput from 'ink-text-input'
import { FilePalimpsestStore, CLEAR, getProject, getAgenda, getContext, buildStateFromConfig, PALIMPSEST_CONFIG, createEmptyState, isValidExpression } from 'palimpsest'
import type { PalimpsestStore, ProjectionState } from 'palimpsest'
import { useAppState, ClientPalimpsestStore, parseDueDate, getDueDatePreview, getRecurrencePreview, resolveKeyAction, AGENDA_PREFIX, PROJECT_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from 'palimpsest-ui-core'
import { FilePendingEventStore } from './FilePendingEventStore.js'
import type { View } from 'palimpsest-ui-core'
import { formatDate, formatDateTime } from './format.js'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const apiUrl = process.env['PALIMPSEST_API_URL']
const authToken = process.env['PALIMPSEST_AUTH_TOKEN']

const configState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

let store: PalimpsestStore
if (apiUrl !== undefined && authToken !== undefined) {
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
  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    let cancelled = false
    void store.init()
      .catch(() => {})
      .then(() => store.getState())
      .then(state => { if (!cancelled) setInitialState(state) })
      .catch(() => { if (!cancelled) setInitialState(configState) })
    return () => { cancelled = true }
  }, [])

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
    view, mode, formValue, activeTask, activeProject,
    activeSphere, projectStats, listItems, currentTask, selectedItem, selectedProject, spheres, subtitle,
    searchQuery, projState, commands, dispatch, canGoBack, showCompleted, showArchived, showProject,
    syncState,
  } = appState

  const { health: syncHealth, unsyncedCount, pendingConflicts, lastError: lastSyncError } = syncState

  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    process.stdout.write(`\x1b]0;Palimpsest — ${subtitle}\x07`)
    return () => { process.stdout.write('\x1b]0;\x07') }
  }, [subtitle])

  useInput((input, key) => {
    if (key.escape) {
      // resolveKeyAction always returns non-null for escape
      dispatch(resolveKeyAction('Escape', mode, commands, searchQuery)!)
      return
    }
    // Text-input modes: TextInput component handles the rest
    if (mode !== undefined) return
    // Up/down navigation works the same in all views
    if (key.upArrow) dispatch({ type: 'move-up' })
    if (key.downArrow) dispatch({ type: 'move-down' })
    // Picker views: handle enter/shortcut
    if (listItems.view === 'picking-view') {
      const chosen = listItems.items.find(item => item.key === input) ?? (key.return ? listItems.selectedItem : undefined)
      if (chosen !== undefined) {
        const navState =
          chosen.value === 'tasks'      ? { view: 'tasks' as const,      selected: 0, showCompleted: false } :
          chosen.value === 'projects'   ? { view: 'projects' as const,   selected: 0, showArchived: false } :
          chosen.value === 'processing' ? { view: 'processing' as const, selected: 0 } :
                                          { view: 'dashboard' as const,  selected: 0 }
        dispatch({ type: 'set-nav', navState })
      }
      return
    }
    if (listItems.view === 'picking-agenda-for-task') {
      if (currentTask !== undefined) {
        const item = listItems.items.find(a => a.key === input) ?? (key.return ? listItems.selectedItem : undefined)
        if (item !== undefined) dispatch({ type: 'set-task-agenda', taskId: currentTask.id, agendaId: item.value ?? CLEAR })
      }
      return
    }
    if (listItems.view === 'picking-context-for-task') {
      if (currentTask !== undefined) {
        const item = listItems.items.find(c => c.key === input) ?? (key.return ? listItems.selectedItem : undefined)
        if (item !== undefined) dispatch({ type: 'set-task-context', taskId: currentTask.id, contextId: item.value ?? CLEAR })
      }
      return
    }
    if (listItems.view === 'picking-due-date') {
      const item = listItems.items.find(o => o.key === input) ?? (key.return ? listItems.selectedItem : undefined)
      if (item !== undefined && currentTask !== undefined) {
        if (item.value === null) {
          dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: CLEAR })
        } else if (item.value === 'custom') {
          dispatch({ type: 'set-mode', mode: { type: 'editing-due-date', formValue: '' } })
        } else {
          dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: item.value })
        }
      }
      return
    }
    if (listItems.view === 'picking-project-for-task') {
      if (key.return && currentTask !== undefined) {
        const item = listItems.selectedItem
        if (item !== undefined) {
          dispatch({ type: 'set-task-project', taskId: currentTask.id, projectId: item.value ?? CLEAR })
        } else if (listItems.items.length === 0 && searchQuery.trim() !== '' && activeSphere !== undefined) {
          dispatch({ type: 'create-and-assign-project', name: searchQuery.trim(), sphereId: activeSphere.id, taskId: currentTask.id })
        }
      }
      return
    }
    if (listItems.view === 'picking-waiting-for-task') {
      if (currentTask !== undefined) {
        const item = listItems.items.find(i => i.key === input) ?? (key.return ? listItems.selectedItem : undefined)
        if (item !== undefined) {
          if (item.value === 'clear') dispatch({ type: 'set-waiting', taskId: currentTask.id, waitingFor: CLEAR })
          else if (item.value === 'review') dispatch({ type: 'set-waiting', taskId: currentTask.id, waitingFor: { kind: 'review' } })
          else if (item.value === 'agenda') dispatch({ type: 'navigate', navState: { view: 'picking-waiting-agenda', selected: 0, activeTaskId: currentTask.id } })
          else if (item.value === 'project') dispatch({ type: 'navigate', navState: { view: 'picking-waiting-project', selected: 0, activeTaskId: currentTask.id, searchQuery: '' } })
        }
      }
      return
    }
    if (listItems.view === 'picking-waiting-agenda') {
      if (currentTask !== undefined) {
        const item = listItems.items.find(a => a.key === input) ?? (key.return ? listItems.selectedItem : undefined)
        if (item !== undefined) dispatch({ type: 'set-waiting', taskId: currentTask.id, waitingFor: { kind: 'agenda', agendaId: item.value } })
      }
      return
    }
    if (listItems.view === 'picking-waiting-project') {
      if (key.return && currentTask !== undefined) {
        const item = listItems.selectedItem
        if (item !== undefined) {
          dispatch({ type: 'set-waiting', taskId: currentTask.id, waitingFor: { kind: 'project', projectId: item.value } })
        }
      }
      return
    }
    // List mode
    if (key.return && selectedItem !== undefined) {
      if (selectedItem.kind === 'task') {
        dispatch({ type: 'navigate', navState: { view: 'task', activeTaskId: selectedItem.task.id } })
      } else if (selectedItem.kind === 'project') {
        dispatch({ type: 'navigate', navState: { view: 'project', selected: 0, activeProjectId: selectedItem.project.id, showCompleted: false } })
      }
    }

    const action = resolveKeyAction(input, mode, commands)
    if (action !== null) dispatch(action)
  })

  function handleTaskSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed) {
      const projectId = view === 'project' ? activeProject?.id : undefined
      dispatch({
        type: 'create-task',
        title: trimmed,
        ...(projectId !== undefined && { projectId }),
        ...(activeSphere !== undefined && { sphereId: activeSphere.id }),
      })
    } else {
      dispatch({ type: 'exit-mode' })
    }
  }

  function handleEditSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed && currentTask !== undefined) {
      dispatch({ type: 'edit-task', taskId: currentTask.id, title: trimmed })
    } else {
      dispatch({ type: 'exit-mode' })
    }
  }

  function handleEditDescriptionSubmit(description: string) {
    if (currentTask !== undefined) {
      dispatch({ type: 'edit-task-description', taskId: currentTask.id, description: description.trim() })
    } else {
      dispatch({ type: 'exit-mode' })
    }
  }

  function handleDueDateSubmit(value: string) {
    const parsed = parseDueDate(value, today)
    if (parsed !== null && currentTask !== undefined) {
      dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: parsed })
    }
  }

  function handleRecurrenceSubmit(value: string) {
    const trimmed = value.trim()
    if (currentTask === undefined) return
    if (trimmed === '') {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: CLEAR })
    } else if (isValidExpression(trimmed)) {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: trimmed })
    }
  }

  function handleProjectSubmit(name: string) {
    const trimmed = name.trim()
    if (trimmed && activeSphere !== undefined) {
      dispatch({ type: 'create-project', name: trimmed, sphereId: activeSphere.id })
    } else {
      dispatch({ type: 'exit-mode' })
    }
  }

  function handleEditProjectSubmit(name: string) {
    const trimmed = name.trim()
    if (trimmed && selectedProject !== undefined) {
      dispatch({ type: 'edit-project', projectId: selectedProject.id, name: trimmed })
    } else {
      dispatch({ type: 'exit-mode' })
    }
  }

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
            <TextInput value={formValue} onChange={v => dispatch({ type: 'update-mode', formValue: v })} onSubmit={handleDueDateSubmit} />
          </Box>
          {dueDatePreviewHint}
        </Box>
      )
      footer = <Text dimColor>enter to set  esc cancel</Text>
    } else {
      content = listItems.items.map(item => {
        const isSelected = item === listItems.selectedItem
        const label = item.value !== null && item.value !== 'custom' ? `${item.label} — ${formatDate(item.value)}` : item.label
        return (
          <Text key={item.key} {...(isSelected ? { color: 'blue' as const } : {})}>
            {isSelected ? '> ' : '  '}{label}<Text dimColor>  {item.key}</Text>
          </Text>
        )
      })
      footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
    }
  } else if (listItems.view === 'picking-agenda-for-task') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = listItems.items.map((item, i) => {
      const isSelected = item === listItems.selectedItem
      return (
        <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
          {isSelected ? '> ' : '  '}{item.prefix ?? ''}{item.label}
          {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
        </Text>
      )
    })
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-context-for-task') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = listItems.items.map((item, i) => {
      const isSelected = item === listItems.selectedItem
      return (
        <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
          {isSelected ? '> ' : '  '}{item.prefix ?? ''}{item.label}
          {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
        </Text>
      )
    })
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-waiting-for-task') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = listItems.items.map((item, i) => {
      const isSelected = item === listItems.selectedItem
      return (
        <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
          {isSelected ? '> ' : '  '}{item.label}
          {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
        </Text>
      )
    })
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-waiting-agenda') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = listItems.items.map((item, i) => {
      const isSelected = item === listItems.selectedItem
      return (
        <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
          {isSelected ? '> ' : '  '}{item.prefix ?? ''}{item.label}
          {item.key !== undefined ? <Text dimColor>  {item.key}</Text> : null}
        </Text>
      )
    })
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-waiting-project') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>Search: </Text>
          <TextInput
            value={searchQuery}
            onChange={(v) => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
            onSubmit={() => {}}
          />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {listItems.items.map((item, i) => {
            const isSelected = item === listItems.selectedItem
            return (
              <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
                {isSelected ? '> ' : '  '}{item.label}
              </Text>
            )
          })}
        </Box>
      </Box>
    )
    footer = <Text dimColor>type to search  ↑↓ navigate  enter select  esc back</Text>
  } else if (listItems.view === 'picking-project-for-task') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>Search: </Text>
          <TextInput
            value={searchQuery}
            onChange={(v) => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
            onSubmit={() => {}}
          />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {listItems.items.length === 0 && searchQuery.trim() !== '' ? (
            <Text color="blue">{'> '}Create project "{searchQuery.trim()}"</Text>
          ) : listItems.items.map((item, i) => {
            const isSelected = item === listItems.selectedItem
            return (
              <Text key={i} {...(isSelected ? { color: 'blue' as const } : {})}>
                {isSelected ? '> ' : '  '}{item.label}
              </Text>
            )
          })}
        </Box>
      </Box>
    )
    footer = <Text dimColor>type to search  ↑↓ navigate  enter select  esc back</Text>
  } else if (listItems.view === 'picking-view') {
    title = <Text bold color="cyan">{subtitle}</Text>
    content = listItems.items.map(item => {
      const isSelected = item === listItems.selectedItem
      return (
        <Text key={item.value} {...(isSelected ? { color: 'blue' as const } : {})}>
          {isSelected ? '> ' : '  '}{item.label}<Text dimColor>  {item.key}</Text>
        </Text>
      )
    })
    footer = <Text dimColor>↑↓ navigate  enter select  esc back</Text>
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
      const detailProject = activeTask?.projectId !== undefined ? getProject(projState, activeTask.projectId) : undefined
      const detailAgenda = activeTask?.agendaId !== undefined ? getAgenda(projState, activeTask.agendaId) : undefined
      const detailContext = activeTask?.contextId !== undefined ? getContext(projState, activeTask.contextId) : undefined
      return (
        <Box flexDirection="column">
          {activeTask?.description
            ? <Text>{activeTask.description}</Text>
            : <Text dimColor>No description.</Text>
          }
          <Box flexDirection="column" marginTop={1}>
            {detailProject !== undefined ? <Text dimColor>project    {PROJECT_PREFIX}{detailProject.name}</Text> : null}
            {detailAgenda !== undefined ? <Text dimColor>agenda     {AGENDA_PREFIX}{detailAgenda.title}</Text> : null}
            {detailContext !== undefined ? <Text dimColor>context    {CONTEXT_PREFIX}{detailContext.name}</Text> : null}
            {activeTask?.dueDate !== undefined ? <Text dimColor>due        {activeTask.dueDate}</Text> : null}
            {activeTask?.dueDateExpression !== undefined ? <Text dimColor>recurring  {RECURRENCE_PREFIX} {activeTask.dueDateExpression}</Text> : null}
            {activeTask?.completedAt !== undefined ? <Text dimColor>completed  {formatDateTime(activeTask.completedAt)}</Text> : null}
            {activeTask?.isNext === true ? <Text dimColor>next action</Text> : null}
            {activeTask?.isStarred === true ? <Text dimColor>starred</Text> : null}
          </Box>
        </Box>
      )
    })() : (listItems.view === 'dashboard' || listItems.view === 'tasks' || listItems.view === 'project' || listItems.view === 'projects' || listItems.view === 'processing') ? (
      <ItemList
        groups={listItems.groups}
        selectedItem={selectedItem}
        state={projState}
        projectStats={projectStats}
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
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleTaskSubmit} />
        </Box>
      )
    ) : mode?.type === 'editing-task' ? (
      <Box>
        <Text>Edit task: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleEditSubmit} />
      </Box>
    ) : mode?.type === 'editing-description' ? (
      <Box>
        <Text>Description: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleEditDescriptionSubmit} />
      </Box>
    ) : mode?.type === 'editing-recurrence' ? (
      <Box flexDirection="column">
        <Box>
          <Text>Recurring: </Text>
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleRecurrenceSubmit} />
        </Box>
        {recurrencePreviewHint}
      </Box>
    ) : mode?.type === 'adding-project' ? (
      activeSphere === undefined ? (
        <Text color="red">No spheres found — create a sphere first.</Text>
      ) : (
        <Box>
          <Text>New project: </Text>
          <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleProjectSubmit} />
        </Box>
      )
    ) : mode?.type === 'editing-project' ? (
      <Box>
        <Text>Edit project: </Text>
        <TextInput value={formValue} onChange={onChangeFormValue} onSubmit={handleEditProjectSubmit} />
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
