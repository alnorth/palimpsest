import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useWindowSize } from 'ink'
import { TaskList } from './TaskList.js'
import { Row, Meta } from './Row.js'
import { Title } from './Title.js'
import TextInput from 'ink-text-input'
import { FilePalimpsestStore, CLEAR, getProject, getAgenda, getContext, isValidExpression, nextDueDate, buildStateFromConfig, PALIMPSEST_CONFIG, createEmptyState } from 'palimpsest'
import type { PalimpsestStore } from 'palimpsest'
import { useAppState, INITIAL_NAV, ClientPalimpsestStore, parseDueDate, AGENDA_PREFIX, PROJECT_PREFIX, CONTEXT_PREFIX, RECURRENCE_PREFIX } from 'palimpsest-ui-core'
import { FilePendingEventStore } from './FilePendingEventStore.js'
import type { View } from 'palimpsest-ui-core'
import { formatDate, formatDateWithDay, formatDateTime } from './format.js'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const apiUrl = process.env['PALIMPSEST_API_URL']
const authToken = process.env['PALIMPSEST_AUTH_TOKEN']

const initialState = { ...createEmptyState(), ...buildStateFromConfig(PALIMPSEST_CONFIG) }

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
    { pendingStore: new FilePendingEventStore(pendingPath), initialState },
  )
} else {
  const filePath = process.env['PALIMPSEST_FILE'] ?? join(homedir(), '.palimpsest', 'events.jsonl')
  mkdirSync(dirname(filePath), { recursive: true })
  store = new FilePalimpsestStore(filePath, initialState)
}


function App() {
  const {
    view, mode, selected, tasks, dashboardTasks, projects, projectTasks, activeTask, activeProject,
    activeSphere, agendas, contexts, projectStats, listItems, listLength, currentTask, spheres, subtitle,
    searchQuery, projState, uiState, commands, dispatch, canGoBack, showCompleted, showArchived,
    isLoading, syncHealth, unsyncedCount, pendingConflicts, lastSyncError,
  } = useAppState(store)

  const [formValue, setFormValue] = useState('')
  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    process.stdout.write(`\x1b]0;Palimpsest — ${subtitle}\x07`)
    return () => { process.stdout.write('\x1b]0;\x07') }
  }, [subtitle])

  useInput((input, key) => {
    if (key.escape) {
      if (mode !== 'list') {
        setFormValue('')
        dispatch({ type: 'set-mode', mode: 'list' })
      } else {
        dispatch({ type: 'go-back' })
      }
      return
    }
    // Text-input modes: TextInput component handles the rest
    if (mode !== 'list') return
    // Up/down navigation works the same in all views (listLength covers pickers too)
    if (key.upArrow) dispatch({ type: 'update-nav', patch: { selected: Math.max(0, selected - 1) } })
    if (key.downArrow) dispatch({ type: 'update-nav', patch: { selected: Math.min(Math.max(0, listLength - 1), selected + 1) } })
    // Picker views: handle enter/shortcut
    if (listItems.view === 'picking-view') {
      const items = listItems.items
      const shortcut = items.find(item => item.key === input)
      const chosen = shortcut ?? (key.return ? items[selected] : undefined)
      if (chosen !== undefined) {
        dispatch({ type: 'set-nav', navState: { view: chosen.id, selected: 0, showCompleted: false, showArchived: false } })
      }
      return
    }
    if (listItems.view === 'picking-agenda-for-task') {
      const items = listItems.items
      if (currentTask !== undefined) {
        const shortcutItem = items.find(a => a.key === input)
        if (shortcutItem !== undefined) {
          dispatch({ type: 'set-task-agenda', taskId: currentTask.id, agendaId: shortcutItem.id ?? CLEAR })
          return
        }
        if (key.return) {
          const item = items[selected]
          if (item !== undefined) dispatch({ type: 'set-task-agenda', taskId: currentTask.id, agendaId: item.id ?? CLEAR })
        }
      }
      return
    }
    if (listItems.view === 'picking-context-for-task') {
      const items = listItems.items
      if (currentTask !== undefined) {
        const shortcutItem = items.find(c => c.key === input)
        if (shortcutItem !== undefined) {
          dispatch({ type: 'set-task-context', taskId: currentTask.id, contextId: shortcutItem.id ?? CLEAR })
          return
        }
        if (key.return) {
          const item = items[selected]
          if (item !== undefined) dispatch({ type: 'set-task-context', taskId: currentTask.id, contextId: item.id ?? CLEAR })
        }
      }
      return
    }
    if (listItems.view === 'picking-due-date') {
      const items = listItems.items
      const shortcutIdx = items.findIndex(o => o.key === input)
      const activeIdx = shortcutIdx !== -1 ? shortcutIdx : (key.return ? selected : -1)
      if (activeIdx !== -1 && currentTask !== undefined) {
        const opt = items[activeIdx]!
        if (opt.date !== null) {
          dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: opt.date })
        } else if (opt.key === 'c') {
          setFormValue('')
          dispatch({ type: 'set-mode', mode: 'editing-due-date' })
        } else {
          dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: CLEAR })
        }
      }
      return
    }
    if (listItems.view === 'picking-project-for-task') {
      if (key.return && currentTask !== undefined) {
        const item = listItems.items[selected]
        if (item !== undefined) {
          dispatch({ type: 'set-task-project', taskId: currentTask.id, projectId: item.id ?? CLEAR })
        } else if (listItems.items.length === 0 && searchQuery.trim() !== '' && activeSphere !== undefined) {
          dispatch({ type: 'create-and-assign-project', name: searchQuery.trim(), sphereId: activeSphere.id, taskId: currentTask.id })
        }
      }
      return
    }
    // List mode
    if (key.return && view === 'projects') {
      const project = projects[selected]
      if (project !== undefined) {
        dispatch({ type: 'navigate', navState: { view: 'project', selected: 0, activeProjectId: project.id, showCompleted: false, showArchived: false } })
      }
    }
    if (key.return && (view === 'tasks' || view === 'project' || view === 'dashboard')) {
      const task = (view === 'project' ? projectTasks : view === 'dashboard' ? dashboardTasks : tasks)[selected]
      if (task !== undefined) {
        dispatch({ type: 'navigate', navState: { view: 'task', activeTaskId: task.id } })
      }
    }

    const cmd = commands.find(c => c.key === input)
    if (cmd) {
      if (cmd.id === 'edit-task' && currentTask !== undefined) setFormValue(currentTask.title)
      if (cmd.id === 'edit-description') setFormValue(currentTask?.description ?? '')
      if (cmd.id === 'set-recurrence') setFormValue(currentTask?.dueDateExpression ?? '')
      if (cmd.id === 'edit-project') setFormValue(projects[selected]?.name ?? '')
      if (cmd.id === 'pick-agenda' && currentTask !== undefined) {
        const idx = currentTask.agendaId !== undefined ? agendas.findIndex(a => a.id === currentTask.agendaId) + 1 : 0
        dispatch({ type: 'navigate', navState: { view: 'picking-agenda-for-task', selected: Math.max(0, idx), activeTaskId: currentTask.id } })
      } else if (cmd.id === 'pick-context' && currentTask !== undefined) {
        const idx = currentTask.contextId !== undefined ? contexts.findIndex(c => c.id === currentTask.contextId) + 1 : 0
        dispatch({ type: 'navigate', navState: { view: 'picking-context-for-task', selected: Math.max(0, idx), activeTaskId: currentTask.id } })
      } else if (cmd.id === 'pick-project' && currentTask !== undefined) {
        dispatch({ type: 'navigate', navState: { view: 'picking-project-for-task', selected: 0, activeTaskId: currentTask.id, searchQuery: '' } })
      } else {
        dispatch(cmd.action)
      }
    }
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
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed && currentTask !== undefined) {
      dispatch({ type: 'edit-task', taskId: currentTask.id, title: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditDescriptionSubmit(description: string) {
    if (currentTask !== undefined) {
      dispatch({ type: 'edit-task-description', taskId: currentTask.id, description: description.trim() })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleDueDateSubmit(value: string) {
    const parsed = parseDueDate(value, today)
    if (parsed !== null && currentTask !== undefined) {
      dispatch({ type: 'set-task-due-date', taskId: currentTask.id, dueDate: parsed })
      setFormValue('')
      dispatch({ type: 'set-mode', mode: 'list' })
    }
  }

  function handleRecurrenceSubmit(value: string) {
    const trimmed = value.trim()
    if (currentTask === undefined) return
    if (trimmed === '') {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: CLEAR })
      setFormValue('')
    } else if (isValidExpression(trimmed)) {
      dispatch({ type: 'set-task-due-date-expression', taskId: currentTask.id, dueDateExpression: trimmed })
      setFormValue('')
    }
  }

  function handleProjectSubmit(name: string) {
    const trimmed = name.trim()
    if (trimmed && activeSphere !== undefined) {
      dispatch({ type: 'create-project', name: trimmed, sphereId: activeSphere.id })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function handleEditProjectSubmit(name: string) {
    const trimmed = name.trim()
    const project = projects[selected]
    if (trimmed && project !== undefined) {
      dispatch({ type: 'edit-project', projectId: project.id, name: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  const _d = new Date()
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`

  const dueDatePreviewHint: React.ReactNode = (() => {
    const parsed = formValue.trim().length > 0 ? parseDueDate(formValue, today) : null
    if (formValue.trim().length === 0) return <Text dimColor>  tomorrow · next monday · jul 4 · 2026-12-25</Text>
    if (parsed !== null) return <Text color="green">  → {formatDateWithDay(parsed)}</Text>
    return <Text color="red">  Can't parse — try "tomorrow", "next monday", "jul 4", "2026-12-25"</Text>
  })()

  const recurrencePreviewHint: React.ReactNode = (() => {
    const trimmed = formValue.trim()
    if (trimmed === '') return <Text dimColor>  daily · every monday · every 2 weeks · monthly  (empty to clear)</Text>
    if (!isValidExpression(trimmed)) return <Text color="red">  Invalid expression</Text>
    const dates: string[] = []
    let cur = today
    for (let i = 0; i < 3; i++) {
      const next = nextDueDate(trimmed, cur)
      if (next === null) break
      dates.push(formatDateWithDay(next))
      cur = next
    }
    if (dates.length === 0) return <Text color="red">  No future dates for this expression</Text>
    return <Text color="green">  → {dates.join(' · ')}</Text>
  })()

  let title: React.ReactNode
  let content: React.ReactNode
  let footer: React.ReactNode

  const stateCommands = commands.filter(c => c.group === 'state')
  const viewCommands = commands.filter(c => c.group === 'view')

  if (listItems.view === 'picking-due-date') {
    const dueDateItems = listItems.items
    title = <Text bold color="cyan">Due date{currentTask !== undefined ? ` — ${currentTask.title}` : ''}</Text>
    if (mode === 'editing-due-date') {
      content = (
        <Box flexDirection="column">
          <Box>
            <Text>Due date: </Text>
            <TextInput value={formValue} onChange={setFormValue} onSubmit={handleDueDateSubmit} />
          </Box>
          {dueDatePreviewHint}
        </Box>
      )
      footer = <Text dimColor>enter to set  esc cancel</Text>
    } else {
      content = dueDateItems.map((opt, i) => {
        const isSelected = i === selected
        const label = opt.date !== null ? `${opt.label} — ${formatDate(opt.date)}` : opt.label
        return (
          <Text key={opt.key} {...(isSelected ? { color: 'blue' as const } : {})}>
            {isSelected ? '> ' : '  '}{label}<Text dimColor>  {opt.key}</Text>
          </Text>
        )
      })
      footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
    }
  } else if (listItems.view === 'picking-agenda-for-task') {
    const agendaItems = listItems.items
    title = <Text bold color="cyan">Agenda{currentTask !== undefined ? ` — ${currentTask.title}` : ''}</Text>
    content = agendaItems.map((opt, i) => (
      <Text key={opt.title} {...(i === selected ? { color: 'blue' as const } : {})}>
        {i === selected ? '> ' : '  '}{opt.id !== null ? AGENDA_PREFIX : ''}{opt.title}
        {opt.key !== undefined ? <Text dimColor>  {opt.key}</Text> : null}
      </Text>
    ))
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-context-for-task') {
    const contextItems = listItems.items
    title = <Text bold color="cyan">Context{currentTask !== undefined ? ` — ${currentTask.title}` : ''}</Text>
    content = contextItems.map((opt, i) => (
      <Text key={opt.name} {...(i === selected ? { color: 'blue' as const } : {})}>
        {i === selected ? '> ' : '  '}{opt.id !== null ? CONTEXT_PREFIX : ''}{opt.name}
        {opt.key !== undefined ? <Text dimColor>  {opt.key}</Text> : null}
      </Text>
    ))
    footer = <Text dimColor>↑↓ navigate  enter/key select  esc back</Text>
  } else if (listItems.view === 'picking-project-for-task') {
    const projectItems = listItems.items
    title = <Text bold color="cyan">Project{currentTask !== undefined ? ` — ${currentTask.title}` : ''}</Text>
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
          {projectItems.length === 0 && searchQuery.trim() !== '' ? (
            <Text color="blue">{'> '}Create project "{searchQuery.trim()}"</Text>
          ) : projectItems.map((p, i) => (
            <Text key={p.id ?? 'null'} {...(i === selected ? { color: 'blue' as const } : {})}>
              {i === selected ? '> ' : '  '}{p.name}
            </Text>
          ))}
        </Box>
      </Box>
    )
    footer = <Text dimColor>type to search  ↑↓ navigate  enter select  esc back</Text>
  } else if (listItems.view === 'picking-view') {
    title = <Text bold color="cyan">View</Text>
    content = listItems.items.map((item, i) => (
      <Text key={item.id} {...(i === selected ? { color: 'blue' as const } : {})}>
        {i === selected ? '> ' : '  '}{item.label}<Text dimColor>  {item.key}</Text>
      </Text>
    ))
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
    ) : view === 'task' ? (() => {
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
    })() : view === 'dashboard' ? (
      <TaskList tasks={dashboardTasks} selected={selected} state={projState} showProject emptyMessage="No tasks due today and no starred tasks." />
    ) : view === 'tasks' ? (
      <TaskList tasks={tasks} selected={selected} state={projState} showProject emptyMessage={showCompleted ? 'No completed tasks in this sphere.' : 'No open tasks in this sphere.'} />
    ) : view === 'projects' ? (
      projects.length === 0 ? (
        <Text dimColor>No projects.</Text>
      ) : projects.map((project, i) => {
        const isSelected = i === selected
        const hasNext = projectStats.hasNext.has(project.id)
        const color = isSelected ? 'blue' as const : !showArchived && !hasNext ? 'red' as const : undefined
        const count = projectStats.taskCount.get(project.id) ?? 0
        return (
          <Row key={project.id} isSelected={isSelected} color={color} title={project.name}>
            {project.archivedAt !== undefined ? <Meta>{formatDate(project.archivedAt)}</Meta> : null}
            <Meta>{count}</Meta>
          </Row>
        )
      })
    ) : (
      <TaskList tasks={projectTasks} selected={selected} state={projState} emptyMessage={showCompleted ? 'No completed tasks in this project.' : 'No open tasks in this project.'} />
    )
    footer = mode === 'adding' ? (
      activeSphere === undefined ? (
        <Text color="red">No spheres found — create a sphere first.</Text>
      ) : (
        <Box>
          <Text>New task: </Text>
          <TextInput value={formValue} onChange={setFormValue} onSubmit={handleTaskSubmit} />
        </Box>
      )
    ) : mode === 'editing-task' ? (
      <Box>
        <Text>Edit task: </Text>
        <TextInput value={formValue} onChange={setFormValue} onSubmit={handleEditSubmit} />
      </Box>
    ) : mode === 'editing-description' ? (
      <Box>
        <Text>Description: </Text>
        <TextInput value={formValue} onChange={setFormValue} onSubmit={handleEditDescriptionSubmit} />
      </Box>
    ) : mode === 'editing-recurrence' ? (
      <Box flexDirection="column">
        <Box>
          <Text>Recurring: </Text>
          <TextInput value={formValue} onChange={setFormValue} onSubmit={handleRecurrenceSubmit} />
        </Box>
        {recurrencePreviewHint}
      </Box>
    ) : mode === 'adding-project' ? (
      activeSphere === undefined ? (
        <Text color="red">No spheres found — create a sphere first.</Text>
      ) : (
        <Box>
          <Text>New project: </Text>
          <TextInput value={formValue} onChange={setFormValue} onSubmit={handleProjectSubmit} />
        </Box>
      )
    ) : mode === 'editing-project' ? (
      <Box>
        <Text>Edit project: </Text>
        <TextInput value={formValue} onChange={setFormValue} onSubmit={handleEditProjectSubmit} />
      </Box>
    ) : listHint
  }

  if (isLoading) {
    return (
      <Box flexDirection="column" height={termRows} paddingX={1}>
        <Box paddingTop={1}><Text bold color="cyan">Palimpsest</Text></Box>
        <Box flexGrow={1} flexDirection="column" paddingTop={1}>
          <Text dimColor>Connecting…</Text>
        </Box>
      </Box>
    )
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
