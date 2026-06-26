import React, { useState } from 'react'
import { TextInput, Button, Stack, Title, Center, Paper, Text } from '@mantine/core'

interface Props {
  configApiUrl: string | null
  onSave: () => void
}

export function SetupScreen({ configApiUrl, onSave }: Props) {
  const [apiUrl, setApiUrl] = useState('')
  const [authToken, setAuthToken] = useState('')

  function handleSave() {
    const token = authToken.trim()
    if (!token) return
    if (configApiUrl === null) {
      if (!apiUrl.trim()) return
      localStorage.setItem('palimpsest_api_url', apiUrl.trim())
    }
    localStorage.setItem('palimpsest_auth_token', token)
    onSave()
  }

  return (
    <Center h="100vh">
      <Paper p="xl" w={400}>
        <Stack>
          <Title order={2}>Palimpsest</Title>
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
          <Button onClick={handleSave}>Save</Button>
        </Stack>
      </Paper>
    </Center>
  )
}
