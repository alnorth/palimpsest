// Todoist Sync API v9 — single endpoint for reading and writing.
// https://developer.todoist.com/sync/v9/

const SYNC_URL = 'https://api.todoist.com/api/v1/sync'

// ── Response types ────────────────────────────────────────────────────────────

export interface SyncItem {
  id: string
  content: string
  description: string
  project_id: string
  labels: string[]
  priority: number        // 1 = normal (p4 in UI), 4 = urgent (p1 in UI)
  due: {
    date: string          // YYYY-MM-DD
    is_recurring: boolean
    string: string        // e.g. "every mon", "every! 3 weeks"
  } | null
  checked: boolean
  is_deleted: boolean
  added_at: string        // ISO 8601
  completed_at: string | null
}

export interface SyncProject {
  id: string
  name: string
  parent_id: string | null
  is_inbox_project: boolean
  is_archived: boolean
  is_deleted: boolean
}

export interface SyncReadResponse {
  sync_token: string
  full_sync: boolean
  full_sync_date_utc?: string   // present on initial full sync only
  items: SyncItem[]
  projects: SyncProject[]
}

export interface SyncCommand {
  type: string
  uuid: string
  temp_id?: string
  args: Record<string, unknown>
}

export interface SyncWriteResponse {
  sync_status: Record<string, 'ok' | { error_code: number; error: string }>
  temp_id_mapping: Record<string, string>
  sync_token?: string
}

// ── Request helpers ───────────────────────────────────────────────────────────

async function post<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Todoist Sync API → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Public API ────────────────────────────────────────────────────────────────

// Fetch a snapshot (syncToken = '*') or an incremental delta (saved token).
// resource_types omitted from incremental calls returns all changed resource types.
export function syncRead(token: string, syncToken: string): Promise<SyncReadResponse> {
  return post<SyncReadResponse>(token, {
    sync_token: syncToken,
    resource_types: ['projects', 'items'],
    commands: [],
  })
}

export function syncWrite(token: string, commands: SyncCommand[]): Promise<SyncWriteResponse> {
  return post<SyncWriteResponse>(token, { commands })
}
