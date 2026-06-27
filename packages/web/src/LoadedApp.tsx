import React, { useState } from 'react'
import { AppShell, Group, Text, ScrollArea, Badge, Burger, Button, Stack } from '@mantine/core'
import type { PalimpsestStore, ProjectionState, Task } from 'palimpsest'
import { CLEAR, isValidExpression } from 'palimpsest'
import { useAppState, parseDueDate } from 'palimpsest-ui-core'
import { useKeyboard } from './useKeyboard.js'
import { TaskList } from './components/TaskList.js'
import { TaskDetail } from './components/TaskDetail.js'
import { ProjectList } from './components/ProjectList.js'
import { CommandBar } from './components/CommandBar.js'
import { NavDrawer } from './components/NavDrawer.js'
import { SyncStatus } from './components/SyncStatus.js'
import { ViewPicker, AgendaPicker, ContextPicker, DueDatePicker, ProjectSearch } from './components/Pickers.js'

interface Props {
  store: PalimpsestStore
  initialState: ProjectionState
}

export function LoadedApp({ store, initialState }: Props) {
  const appState = useAppState(store, initialState)
  const {
    view, mode, selected, activeTask, activeProject,
    activeSphere, spheres, projectStats, listItems, currentTask,
    subtitle, projState, commands, dispatch, canGoBack, showCompleted, showArchived,
    syncState, searchQuery, activate,
  } = appState

  const [formValue, setFormValue] = useState('')
  const [navDrawerOpen, setNavDrawerOpen] = useState(false)

  useKeyboard(appState, formValue, setFormValue)

  const today = new Date().toISOString().slice(0, 10)

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
    const project = listItems.view === 'projects' ? listItems.items[selected] : undefined
    if (trimmed && project !== undefined) {
      dispatch({ type: 'edit-project', projectId: project.id, name: trimmed })
    } else {
      dispatch({ type: 'set-mode', mode: 'list' })
    }
    setFormValue('')
  }

  function getSubmitHandler(): (v: string) => void {
    if (mode === 'adding') return handleTaskSubmit
    if (mode === 'editing-task') return handleEditSubmit
    if (mode === 'editing-description') return handleEditDescriptionSubmit
    if (mode === 'editing-due-date') return handleDueDateSubmit
    if (mode === 'editing-recurrence') return handleRecurrenceSubmit
    if (mode === 'adding-project') return handleProjectSubmit
    if (mode === 'editing-project') return handleEditProjectSubmit
    return () => {}
  }

  function handleHover(i: number) {
    dispatch({ type: 'update-nav', patch: { selected: i } })
  }

  function handleTaskComplete(task: Task) {
    if (task.status === 'open') {
      dispatch({ type: 'complete-task', taskId: task.id })
    } else {
      dispatch({ type: 'uncomplete-task', taskId: task.id })
    }
  }

  const toggleCmd = commands['toggle-completed'] ?? commands['toggle-archived']

  let titleText: string
  if (listItems.view === 'picking-due-date') {
    titleText = `Due date${currentTask !== undefined ? ` — ${currentTask.title}` : ''}`
  } else if (listItems.view === 'picking-agenda-for-task') {
    titleText = `Agenda${currentTask !== undefined ? ` — ${currentTask.title}` : ''}`
  } else if (listItems.view === 'picking-context-for-task') {
    titleText = `Context${currentTask !== undefined ? ` — ${currentTask.title}` : ''}`
  } else if (listItems.view === 'picking-project-for-task') {
    titleText = `Project${currentTask !== undefined ? ` — ${currentTask.title}` : ''}`
  } else if (listItems.view === 'picking-view') {
    titleText = 'View'
  } else {
    titleText = `${activeSphere?.name ?? 'Palimpsest'} — ${subtitle}`
  }

  let content: React.ReactNode

  if (listItems.view === 'picking-view') {
    content = <ViewPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-agenda-for-task') {
    content = <AgendaPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-context-for-task') {
    content = <ContextPicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-due-date') {
    content = <DueDatePicker items={listItems.items} selected={selected} onHover={handleHover} onActivate={activate} />
  } else if (listItems.view === 'picking-project-for-task') {
    content = (
      <ProjectSearch
        items={listItems.items}
        selected={selected}
        searchQuery={searchQuery}
        onSearchChange={v => dispatch({ type: 'update-nav', patch: { searchQuery: v, selected: 0 } })}
        onHover={handleHover}
        onActivate={activate}
      />
    )
  } else if (listItems.view === 'task' && activeTask !== undefined) {
    content = <TaskDetail task={activeTask} state={projState} commands={commands} dispatch={dispatch} />
  } else if (listItems.view === 'dashboard') {
    content = (
      <TaskList
        tasks={listItems.items}
        selected={selected}
        state={projState}
        showProject
        emptyMessage="No tasks due today and no starred tasks."
        onHover={handleHover}
        onActivate={activate}
        onComplete={handleTaskComplete}
      />
    )
  } else if (listItems.view === 'tasks') {
    content = (
      <TaskList
        tasks={listItems.items}
        selected={selected}
        state={projState}
        showProject
        emptyMessage={showCompleted ? 'No completed tasks in this sphere.' : 'No open tasks in this sphere.'}
        onHover={handleHover}
        onActivate={activate}
        onComplete={handleTaskComplete}
      />
    )
  } else if (listItems.view === 'projects') {
    content = (
      <ProjectList
        projects={listItems.items}
        selected={selected}
        projectStats={projectStats}
        showArchived={showArchived}
        emptyMessage="No projects."
        onHover={handleHover}
        onActivate={activate}
      />
    )
  } else if (listItems.view === 'project') {
    const addTaskCmd = commands['add-task']
    content = (
      <Stack gap="sm">
        {addTaskCmd !== undefined && (
          <Group gap="xs">
            <Button size="xs" variant="light" onClick={() => dispatch(addTaskCmd.action)} style={{ fontFamily: 'monospace' }}>
              {addTaskCmd.label}
            </Button>
          </Group>
        )}
        <TaskList
          tasks={listItems.items}
          selected={selected}
          state={projState}
          emptyMessage={showCompleted ? 'No completed tasks in this project.' : 'No open tasks in this project.'}
          onHover={handleHover}
          onActivate={activate}
          onComplete={handleTaskComplete}
        />
      </Stack>
    )
  } else {
    content = activeSphere === undefined
      ? <Text c="dimmed" size="sm">No spheres configured.</Text>
      : null
  }

  return (
    <AppShell
      header={{ height: 50 }}
      footer={{ height: mode !== 'list' ? 70 : { base: 0, sm: 44 } }}
      padding="md"
      styles={{
        main: { fontFamily: 'monospace' },
        header: { fontFamily: 'monospace' },
        footer: { fontFamily: 'monospace' },
      }}
    >
      <NavDrawer
        opened={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
        spheres={spheres}
        activeSphere={activeSphere}
        currentView={view}
        dispatch={dispatch}
      />
      <AppShell.Header px="md">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <Burger opened={navDrawerOpen} onClick={() => setNavDrawerOpen(o => !o)} size="sm" />
            <Text fw={700}>{titleText}</Text>
          </Group>
          <Group gap="sm">
            {toggleCmd !== undefined && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => dispatch(toggleCmd.action)}
                style={{ fontFamily: 'monospace' }}
              >
                {toggleCmd.label}
              </Button>
            )}
            {showCompleted && view !== 'projects' && <Badge color="yellow" variant="light">completed</Badge>}
            {showArchived && view === 'projects' && <Badge color="yellow" variant="light">archived</Badge>}
            <SyncStatus syncState={syncState} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <ScrollArea h="100%">
          {content}
        </ScrollArea>
      </AppShell.Main>

      <AppShell.Footer px="md" py="sm" {...(mode === 'list' ? { visibleFrom: 'sm' } : {})}>
        <CommandBar
          mode={mode}
          commands={commands}
          canGoBack={canGoBack}
          formValue={formValue}
          onFormChange={setFormValue}
          onFormSubmit={getSubmitHandler()}
        />
      </AppShell.Footer>
    </AppShell>
  )
}
