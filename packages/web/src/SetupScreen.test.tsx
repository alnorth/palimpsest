// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import React from 'react'
import { SetupScreen } from './SetupScreen.js'

function renderSetup(onSave = vi.fn(), configApiUrl: string | null = null) {
  return render(
    <MantineProvider>
      <SetupScreen configApiUrl={configApiUrl} onSave={onSave} />
    </MantineProvider>
  )
}

describe('SetupScreen', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { cleanup() })

  describe('without deployment config (configApiUrl = null)', () => {
    it('renders both API URL and token fields', () => {
      renderSetup()
      expect(screen.getByLabelText(/api url/i)).toBeDefined()
      expect(screen.getByLabelText(/api token/i)).toBeDefined()
    })

    it('saves both to localStorage and calls onSave on submit', () => {
      const onSave = vi.fn()
      renderSetup(onSave)
      fireEvent.change(screen.getByLabelText(/api url/i), { target: { value: 'https://example.com' } })
      fireEvent.change(screen.getByLabelText(/api token/i), { target: { value: 'secret123' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(localStorage.getItem('palimpsest_api_url')).toBe('https://example.com')
      expect(localStorage.getItem('palimpsest_auth_token')).toBe('secret123')
      expect(onSave).toHaveBeenCalledOnce()
    })

    it('does not call onSave when fields are empty', () => {
      const onSave = vi.fn()
      renderSetup(onSave)
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).not.toHaveBeenCalled()
    })

    it('does not call onSave when only token is filled', () => {
      const onSave = vi.fn()
      renderSetup(onSave)
      fireEvent.change(screen.getByLabelText(/api token/i), { target: { value: 'secret123' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).not.toHaveBeenCalled()
    })
  })

  describe('with deployment config (configApiUrl provided)', () => {
    it('renders only the token field', () => {
      renderSetup(vi.fn(), 'https://api.example.com')
      expect(screen.queryByLabelText(/api url/i)).toBeNull()
      expect(screen.getByLabelText(/api token/i)).toBeDefined()
    })

    it('saves only the token to localStorage and calls onSave', () => {
      const onSave = vi.fn()
      renderSetup(onSave, 'https://api.example.com')
      fireEvent.change(screen.getByLabelText(/api token/i), { target: { value: 'secret123' } })
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(localStorage.getItem('palimpsest_auth_token')).toBe('secret123')
      expect(localStorage.getItem('palimpsest_api_url')).toBeNull()
      expect(onSave).toHaveBeenCalledOnce()
    })

    it('does not call onSave when token is empty', () => {
      const onSave = vi.fn()
      renderSetup(onSave, 'https://api.example.com')
      fireEvent.click(screen.getByRole('button', { name: /save/i }))
      expect(onSave).not.toHaveBeenCalled()
    })
  })
})
