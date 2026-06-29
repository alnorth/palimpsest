import React from 'react'
import { Drawer, Stack, Text, Menu, Button, Divider } from '@mantine/core'
import type { Sphere } from 'palimpsest'
import type { Action, TopLevelView, View } from 'palimpsest-ui-core'
import { VIEW_CONFIG, navStateForTopLevelView } from 'palimpsest-ui-core'

interface Props {
  opened: boolean
  onClose: () => void
  spheres: Sphere[]
  activeSphere: Sphere | undefined
  currentView: View
  dispatch: (action: Action) => void
  onLogout: () => void
}

export function NavDrawer({ opened, onClose, spheres, activeSphere, currentView, dispatch, onLogout }: Props) {
  function handleSphere(sphereId: Sphere['id']) {
    dispatch({ type: 'set-sphere', sphereId })
    onClose()
  }

  function handleView(view: TopLevelView) {
    dispatch({ type: 'set-nav', navState: navStateForTopLevelView(view) })
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
            <Menu>
              <Menu.Target>
                <Button
                  variant="default"
                  size="sm"
                  fullWidth
                  styles={{ inner: { justifyContent: 'space-between', fontFamily: 'monospace' }, label: { fontWeight: 400 } }}
                  rightSection="▾"
                >
                  {activeSphere?.name ?? 'Select sphere'}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {spheres.map(sphere => (
                  <Menu.Item
                    key={sphere.id}
                    onClick={() => handleSphere(sphere.id)}
                    style={{ fontFamily: 'monospace', fontWeight: sphere.id === activeSphere?.id ? 600 : undefined }}
                    {...(sphere.id === activeSphere?.id ? { color: 'blue' as const } : {})}
                  >
                    {sphere.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </div>
        )}
        <div>
          <Text size="xs" c="dimmed" mb="xs" style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
            View
          </Text>
          <Stack gap={2}>
            {VIEW_CONFIG.map(v => {
              const isActive = currentView === v.value
              return (
                <Text
                  key={v.value}
                  size="sm"
                  px="xs"
                  py={4}
                  {...(isActive ? { c: 'blue' } : {})}
                  onClick={() => handleView(v.value)}
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
        <Divider />
        <Button variant="subtle" color="red" size="sm" onClick={onLogout} style={{ fontFamily: 'monospace' }}>
          Log out
        </Button>
      </Stack>
    </Drawer>
  )
}
