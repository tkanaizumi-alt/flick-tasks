import type { Status, Task, User } from '../shared/types'

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`)
  }
}

async function req<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.json !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  if (!res.ok) throw new HttpError(res.status)
  return res.json() as Promise<T>
}

export const api = {
  me: () => req<{ user: User }>('/api/me'),
  list: () => req<{ tasks: Task[] }>('/api/tasks'),
  create: (tasks: Partial<Task>[]) => req<{ tasks: Task[] }>('/api/tasks', { method: 'POST', json: { tasks } }),
  update: (id: string, patch: Partial<Pick<Task, 'title' | 'note' | 'status' | 'position'>>) =>
    req<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', json: patch }),
  remove: (id: string) => req<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  ai: (kind: 'split' | 'breakdown', text: string) =>
    req<{ tasks: string[] }>(`/api/ai/${kind}`, { method: 'POST', json: { text } }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
}

export interface PendingMemo {
  id: string
  title: string
  ai: boolean
  at: number
}

declare global {
  interface Window {
    __flick?: { key: string; read: () => PendingMemo[]; write: (q: PendingMemo[]) => void }
  }
}

export const pending = {
  read: (): PendingMemo[] => window.__flick?.read() ?? [],
  remove(id: string) {
    window.__flick?.write(pending.read().filter((p) => p.id !== id))
  },
}

export const STATUS_LABEL: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' }
