import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useWindowSize } from 'ink'
import { TaskList } from './TaskList.js'
import { Row, Meta } from './Row.js'
import TextInput from 'ink-text-input'
import { FilePalimpsestStore, CLEAR, getProject, getAgenda } from 'palimpsest'
import { useAppState, INITIAL_NAV } from 'palimpsest-ui-core'
import type { View } from 'palimpsest-ui-core'
import { formatDate, formatDateTime } from './format.js'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const filePath = process.env['PALIMPSEST_FILE'] ?? join(homedir(), '.palimpsest', 'events.jsonl')
mkdirSync(dirname(filePath), { recursive: true })
const store = new FilePalimpsestStore(filePath)

const VIEW_CONFIG = {
  tasks:    { label: 'Tasks',    key: 't' },
  projects: { label: 'Projects', key: 'p' },
  project:  { label: 'Project'            },
  task:     { label: 'Task'               },
} satisfies Record<View, { label: string; key?: string }>

const TOP_LEVEL_VIEWS = (['tasks', 'projects'] as const).filter(v => VIEW_CONFIG[v].key !== undefined)
const SETTINGS_OPTIONS = ['Create Sphere', 'Create Agenda'] as const

function App() {
  const {
    view, mode, selected, tasks, projects, projectTasks, activeTask, activeProject,
    activeSphere, agendas, projectStats, listLength, currentTask, spheres,
    projState, uiState, commands, dispatch, canGoBack, showCompleted, showArchived,
  } = useAppState(store)

  const { viewPickerSelected, agendaPickerSelected, settingsSelected, pickerSelected, agendaSphereId } = uiState
  const [formValue, setFormValue] = useState('')
  const { rows: termRows } = useWindowSize()

  useEffect(() => {
    const suffix = view === 'task' ? `Task: ${activeTask?.title ?? ''}`
      : view === 'project' ? `Project: ${activeProject?.name ?? ''}`
      : VIEW_CONFIG[view].label
    process.stdout.write(`\x1b]0;Palimpsest — ${suffix}\x07`)
    return () => { process.stdout.write('\x1b]0;\x07') }
  }, [view, activeTask, activeProject])

  function startCreateAgenda() {
    if (spheres.length === 0) {
      dispatch({ type: 'set-mode', mode: 'picking-sphere-for-agenda' })
    } else if (spheres.length === 1) {
      dispatch({ type: 'set-agenda-sphere', sphereId: spheres[0]!.id })
      dispatch({ type: 'set-mode', mode: 'creating-agenda' })
    } else {
      dispatch({ type: 'set-picker-selected', index: 0 })
      dispatch({ type: 'set-mode', mode: 'picking-sphere-for-agenda' })
    }
  }

  useInput((input, key) => {
    if (mode === 'adding' || mode === 'editing-task' || mode === 'editing-description' || mode === 'adding-project' || mode === 'editing-project' || mode === 'creating-sphere' || mode === 'creating-agenda') {
      if (key.escape) {
        setFormValue('')
        dispatch({ type: 'set-mode', mode: mode === 'creating-sphere' || mode === 'creating-agenda' ? 'settings' : 'list' })
      }
      return
    }
    if (mode === 'picking-view') {
      if (key.escape) { dispatch({ type: 'set-mode', mode: 'list' }); return }
      if (key.upArrow) dispatch({ type: 'set-view-picker-selected', index: Math.max(0, viewPickerSelected - 1) })
      if (key.downArrow) dispatch({ type: 'set-view-picker-selected', index: Math.min(TOP_LEVEL_VIEWS.length - 1, viewPickerSelected + 1) })
      const shortcutView = TOP_LEVEL_VIEWS.find(v => VIEW_CONFIG[v].key === input)
      if (shortcutView !== undefined || key.return) {
        const newView = shortcutView ?? TOP_LEVEL_VIEWS[viewPickerSelected]!
        dispatch({ type: 'set-nav', navState: { ...INITIAL_NAV, view: newView } })
        dispatch({ type: 'set-mode', mode: 'list' })
      }
      return
    }
    if (mode === 'picking-agenda-for-task') {
      if (key.escape) { dispatch({ type: 'set-mode', mode: 'list' }); return }
      if (key.upArrow) dispatch({ type: 'set-agenda-picker-selected', index: Math.max(0, agendaPickerSelected - 1) })
      if (key.downArrow) dispatch({ type: 'set-agenda-picker-selected', index: Math.min(agendas.length, agendaPickerSelected + 1) })
      if (key.return && currentTask !== undefined) {
        const agendaId = agendaPickerSelected === 0 ? CLEAR : agendas[agendaPickerSelected - 1]!.id
        dispatch({ type: 'set-task-agenda', taskId: currentTask.id, agendaId })
      }
      return
    }
    if (mode === 'picking-sphere-for-agenda') {
      if (key.escape) { dispatch({ type: 'set-mode', mode: 'settings' }); return }
      if (key.upArrow) dispatch({ type: 'set-picker-selected', index: Math.max(0, pickerSelected - 1) })
      if (key.downArrow) dispatch({ type: 'set-picker-selected', index: Math.min(spheres.length - 1, pickerSelected + 1) })
      if (key.return && spheres.length > 0) {
        dispatch({ type: 'set-agenda-sphere', sphereId: spheres[pickerSelected]!.id })
        dispatch({ type: 'set-mode', mode: 'creating-agenda' })
      }
      return
    }
    if (mode === 'settings') {
      if (key.escape) { dispatch({ type: 'set-mode', mode: 'list' }); return }
      if (key.upArrow) dispatch({ type: 'set-settings-selected', index: Math.max(0, settingsSelected - 1) })
      if (key.downArrow) dispatch({ type: 'set-settings-selected', index: Math.min(SETTINGS_OPTIONS.length - 1, settingsSelected + 1) })
      if (key.return) {
        if (SETTINGS_OPTIONS[settingsSelected] === 'Create Sphere') dispatch({ type: 'set-mode', mode: 'creating-sphere' })
        if (SETTINGS_OPTIONS[settingsSelected] === 'Create Agenda') startCreateAgenda()
      }
      return
    }
    // list mode
    if (key.escape) dispatch({ type: 'go-back' })
    if (key.return && view === 'projects') {
      const project = projects[selected]
      if (project !== undefined) {
        dispatch({ type: 'navigate', navState: { ...INITIAL_NAV, view: 'project', selected: 0, activeProjectId: project.id, activeTaskId: undefined, showCompleted, showArchived } })
      }
    }
    if (key.return && (view === 'tasks' || view === 'project')) {
      const task = (view === 'project' ? projectTasks : tasks)[selected]
      if (task !== undefined) {
        dispatch({ type: 'navigate', navState: { ...INITIAL_NAV, view: 'task', selected: 0, activeProjectId: undefined, activeTaskId: task.id, showCompleted, showArchived } })
      }
    }
    if (key.upArrow) dispatch({ type: 'update-nav', patch: { selected: Math.max(0, selected - 1) } })
    if (key.downArrow) dispatch({ type: 'update-nav', patch: { selected: Math.min(listLength - 1, selected + 1) } })

    const cmd = commands.find(c => c.key === input)
    if (cmd) {
      if (cmd.id === 'edit-task' && currentTask !== undefined) setFormValue(currentTask.title)
      if (cmd.id === 'edit-description') setFormValue(currentTask?.description ?? '')
      if (cmd.id === 'edit-project') setFormValue(projects[selected]?.name ?? '')
      if (cmd.id === 'pick-agenda' && currentTask !== undefined) {
        const idx = currentTask.agendaId !== undefined ? agendas.findIndex(a => a.id === currentTask.agendaId) + 1 : 0
        dispatch({ type: 'set-agenda-picker-selected', index: Math.max(0, idx) })
      }
      if (cmd.id === 'pick-view') {
        dispatch({ type: 'set-view-picker-selected', index: Math.max(0, TOP_LEVEL_VIEWS.indexOf(view as 'tasks' | 'projects')) })
      }
      dispatch(cmd.action)
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

  function handleSphereSubmit(name: string) {
    const trimmed = name.trim()
    if (trimmed) {
      dispatch({ type: 'create-sphere', name: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'settings' })
    }
    setFormValue('')
  }

  function handleAgendaSubmit(title: string) {
    const trimmed = title.trim()
    if (trimmed && agendaSphereId !== undefined) {
      dispatch({ type: 'create-agenda', title: trimmed, sphereId: agendaSphereId })
    } else {
      dispatch({ type: 'set-mode', mode: 'settings' })
    }
    setFormValue('')
  }

  let title: React.ReactNode
  let content: React.ReactNode
  let footer: React.ReactNode

  const stateCommands = commands.filter(c => c.group === 'state')
  const viewCommands = commands.filter(c => c.group === 'view')

  if (mode === 'picking-agenda-for-task') {
    const options = ['No agenda', ...agendas.map(a => a.title)]
    title = <Text bold color="cyan">Agenda{currentTask !== undefined ? ` — ${currentTask.title}` : ''}</Text>
    content = options.map((label, i) => (
      <Text key={label} {...(i === agendaPickerSelected ? { color: 'blue' as const } : {})}>
        {i === agendaPickerSelected ? '> ' : '  '}{i > 0 ? '@' : ''}{label}
      </Text>
    ))
    footer = <Text dimColor>↑↓ navigate  enter select  esc back</Text>
  } else if (mode === 'picking-view') {
    title = <Text bold color="cyan">View</Text>
    content = TOP_LEVEL_VIEWS.map((v, i) => (
      <Text key={v} {...(i === viewPickerSelected ? { color: 'blue' as const } : {})}>
        {i === viewPickerSelected ? '> ' : '  '}{VIEW_CONFIG[v].label}<Text dimColor>  {VIEW_CONFIG[v].key}</Text>
      </Text>
    ))
    footer = <Text dimColor>↑↓ navigate  enter select  esc back</Text>
  } else if (mode === 'settings' || mode === 'creating-sphere' || mode === 'picking-sphere-for-agenda' || mode === 'creating-agenda') {
    title = <Text bold color="cyan">Settings</Text>
    content = (
      <>
        {SETTINGS_OPTIONS.map((option, i) => (
          <Text key={option} {...(i === settingsSelected ? { color: 'blue' as const } : {})}>
            {i === settingsSelected ? '> ' : '  '}{option}
          </Text>
        ))}
        <Box marginTop={1} flexDirection="column">
          {mode === 'creating-sphere' ? (
            <Box>
              <Text>Sphere name: </Text>
              <TextInput value={formValue} onChange={setFormValue} onSubmit={handleSphereSubmit} />
            </Box>
          ) : mode === 'picking-sphere-for-agenda' ? (
            spheres.length === 0 ? (
              <Text color="red">No spheres found — create a sphere first.</Text>
            ) : (
              <>
                <Text dimColor>Select a sphere:</Text>
                {spheres.map((sphere, i) => (
                  <Text key={sphere.id} {...(i === pickerSelected ? { color: 'blue' as const } : {})}>
                    {i === pickerSelected ? '> ' : '  '}{sphere.name}
                  </Text>
                ))}
              </>
            )
          ) : mode === 'creating-agenda' ? (
            <Box>
              <Text>Agenda title: </Text>
              <TextInput value={formValue} onChange={setFormValue} onSubmit={handleAgendaSubmit} />
            </Box>
          ) : null}
        </Box>
      </>
    )
    footer = <Text dimColor>↑↓ navigate  enter select  esc back</Text>
  } else {
    const completedTag = showCompleted && view !== 'projects' ? <Text color="yellow"> completed</Text> : null
    const archivedTag = showArchived && view === 'projects' ? <Text color="yellow"> archived</Text> : null
    const stateRow = stateCommands.map(c => `${c.key} ${c.label}`)
    const viewRow = ['↑↓ navigate', ...viewCommands.map(c => `${c.key} ${c.label}`)]
    if (canGoBack) viewRow.push('esc back')
    const listHint = (
      <Box flexDirection="column">
        {stateRow.length > 0 && <Text dimColor>{stateRow.join('  ')}</Text>}
        <Text dimColor>{viewRow.join('  ')}</Text>
      </Box>
    )
    title = view === 'task'
      ? <><Text bold color="cyan">{activeSphere?.name ?? 'Palimpsest'}</Text><Text dimColor> — Task: {activeTask?.title ?? ''}</Text>{completedTag}</>
      : view === 'project'
      ? <><Text bold color="cyan">{activeSphere?.name ?? 'Palimpsest'}</Text><Text dimColor> — Project: {activeProject?.name ?? ''}</Text>{completedTag}</>
      : <><Text bold color="cyan">{activeSphere?.name ?? 'Palimpsest'}</Text><Text dimColor> — {VIEW_CONFIG[view].label}</Text>{archivedTag}{completedTag}</>
    content = activeSphere === undefined ? (
      <Text dimColor>No spheres yet — press k to open settings and create one.</Text>
    ) : view === 'task' ? (() => {
      const detailProject = activeTask?.projectId !== undefined ? getProject(projState, activeTask.projectId) : undefined
      const detailAgenda = activeTask?.agendaId !== undefined ? getAgenda(projState, activeTask.agendaId) : undefined
      return (
        <Box flexDirection="column">
          {activeTask?.description
            ? <Text>{activeTask.description}</Text>
            : <Text dimColor>No description.</Text>
          }
          <Box flexDirection="column" marginTop={1}>
            {detailProject !== undefined ? <Text dimColor>project    {detailProject.name}</Text> : null}
            {detailAgenda !== undefined ? <Text dimColor>agenda     @{detailAgenda.title}</Text> : null}
            {activeTask?.dueDate !== undefined ? <Text dimColor>due        {activeTask.dueDate}</Text> : null}
            {activeTask?.completedAt !== undefined ? <Text dimColor>completed  {formatDateTime(activeTask.completedAt)}</Text> : null}
            {activeTask?.isNext === true ? <Text dimColor>next action</Text> : null}
            {activeTask?.isStarred === true ? <Text dimColor>starred</Text> : null}
          </Box>
        </Box>
      )
    })() : view === 'tasks' ? (
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

  return (
    <Box flexDirection="column" height={termRows} paddingX={1}>
      <Box paddingTop={1}>{title}</Box>
      <Box flexGrow={1} flexDirection="column" paddingTop={1} overflow="hidden">
        {content}
      </Box>
      <Box paddingBottom={1}>{footer}</Box>
    </Box>
  )
}

render(<App />, { alternateScreen: true })
