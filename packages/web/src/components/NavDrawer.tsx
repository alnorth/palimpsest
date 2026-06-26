import React from 'react'
import { Drawer, Stack, Text } from '@mantine/core'
import type { Sphere } from 'palimpsest'
import type { Action, NavState, TopLevelView, View } from 'palimpsest-ui-core'
import { VIEW_CONFIG } from 'palimpsest-ui-core'

interface Props {
  opened: boolean
  onClose: () => void
  spheres: Sphere[]
  activeSphere: Sphere | undefined
  currentView: View
  dispatch: (action: Action) => void
}

function navStateForView(view: TopLevelView): NavState {
  if (view === 'tasks') return { view: 'tasks', selected: 0, showCompleted: false }
  if (view === 'projects') return { view: 'projects', selected: 0, showArchived: false }
  return { view: 'dashboard', selected: 0 }
}

export function NavDrawer({ opened, onClose, spheres, activeSphere, currentView, dispatch }: Props) {
  function handleSphere(sphereId: Sphere['id']) {
    dispatch({ type: 'set-sphere', sphereId })
    onClose()
  }

  function handleView(view: TopLevelView) {
    dispatch({ type: 'set-nav', navState: navStateForView(view) })
    onClose()
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Palimpsest"
      size="xs"
      styles={{ title: { fontFamily: 'monospace', fontWeight: 700 } }}
    >
      <Stack gap="lg">
        {spheres.length > 0 && (
          <div>
            <Text size="xs" c="dimmed" mb="xs" style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
              Sphere
            </Text>
            <Stack gap={2}>
              {spheres.map(sphere => {
                const isActive = sphere.id === activeSphere?.id
                return (
                  <Text
                    key={sphere.id}
                    size="sm"
                    px="xs"
                    py={4}
                    {...(isActive ? { c: 'blue' } : {})}
                    onClick={() => handleSphere(sphere.id)}
                    style={{
                      background: isActive ? 'var(--mantine-color-blue-light)' : undefined,
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      userSelect: 'none',
                    }}
                  >
                    {sphere.name}
                  </Text>
                )
              })}
            </Stack>
          </div>
        )}
        <div>
          <Text size="xs" c="dimmed" mb="xs" style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
            View
          </Text>
          <Stack gap={2}>
            {VIEW_CONFIG.map(v => {
              const isActive = currentView === v.id
              return (
                <Text
                  key={v.id}
                  size="sm"
                  px="xs"
                  py={4}
                  {...(isActive ? { c: 'blue' } : {})}
                  onClick={() => handleView(v.id)}
                  style={{
                    background: isActive ? 'var(--mantine-color-blue-light)' : undefined,
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    userSelect: 'none',
                  }}
                >
                  {v.label}
                </Text>
              )
            })}
          </Stack>
        </div>
      </Stack>
    </Drawer>
  )
}
