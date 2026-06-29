import React, { useState } from 'react'
import { TextInput, Button, Stack, Title, Center, Paper, Text, Tabs } from '@mantine/core'

interface Props {
  configApiUrl: string | null
  onSave: () => void
}

export function SetupScreen({ configApiUrl, onSave }: Props) {
  const [apiUrl, setApiUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [todoistToken, setTodoistToken] = useState('')

  function handleSaveBackend() {
    const token = authToken.trim()
    if (!token) return
    if (configApiUrl === null) {
      if (!apiUrl.trim()) return
      localStorage.setItem('palimpsest_api_url', apiUrl.trim())
    }
    localStorage.setItem('palimpsest_auth_token', token)
    onSave()
  }

  function handleSaveTodoist() {
    const token = todoistToken.trim()
    if (!token) return
    localStorage.setItem('palimpsest_todoist_token', token)
    onSave()
  }

  return (
    <Center h="100vh">
      <Paper p="xl" w={420}>
        <Stack>
          <Title order={2}>Palimpsest</Title>
          <Tabs defaultValue="todoist">
            <Tabs.List>
              <Tabs.Tab value="todoist">Todoist</Tabs.Tab>
              <Tabs.Tab value="backend">Backend</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="todoist" pt="md">
              <Stack>
                <TextInput
                  label="Todoist API Token"
                  type="password"
                  placeholder="Your Todoist API token"
                  value={todoistToken}
                  onChange={e => setTodoistToken(e.currentTarget.value)}
                />
                <Text size="xs" c="dimmed">
                  Find your token in Todoist → Settings → Integrations → API token
                </Text>
                <Button onClick={handleSaveTodoist}>Connect Todoist</Button>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="backend" pt="md">
              <Stack>
                {configApiUrl === null && (
                  <TextInput
                    label="API URL"
                    placeholder="https://..."
                    value={apiUrl}
                    onChange={e => setApiUrl(e.currentTarget.value)}
                  />
                )}
                {configApiUrl !== null && (
                  <Text size="sm" c="dimmed">API: {configApiUrl}</Text>
                )}
                <TextInput
                  label="API Token"
                  type="password"
                  placeholder="Bearer token"
                  value={authToken}
                  onChange={e => setAuthToken(e.currentTarget.value)}
                />
                <Button onClick={handleSaveBackend}>Connect Backend</Button>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Paper>
    </Center>
  )
}
