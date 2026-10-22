import type { Activity, Person, Status, Task, User } from '../shared/types'
import type { BattleResult, Item, MissionDef, PlayerState, StatKey } from '../shared/game'

export interface XpChange {
  amount: number
  gold: number
  bonuses: string[]
  level: number
  leveledUp: boolean
  unlocked?: { name: string; icon: string } | null
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public reason?: string,
  ) {
    super(reason ?? `HTTP ${status}`)
  }
}

async function req<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: init?.json !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new HttpError(res.status, body?.error)
  }
  return res.json() as Promise<T>
}

export const api = {
  me: () => req<{ user: User }>('/api/me'),
  list: () => req<{ tasks: Task[] }>('/api/tasks'),
  create: (tasks: Partial<Task>[], source: 'user' | 'ai' = 'user') =>
    req<{ tasks: Task[] }>('/api/tasks', { method: 'POST', json: { tasks, source } }),
  update: (id: string, patch: Partial<Pick<Task, 'title' | 'note' | 'status' | 'position'>>) =>
    req<{ task: Task; xp: XpChange | null }>(`/api/tasks/${id}`, { method: 'PATCH', json: patch }),
  player: () => req<{ player: PlayerState }>('/api/player'),
  addStat: (stat: StatKey) => req<{ player: PlayerState }>('/api/player/stat', { method: 'POST', json: { stat } }),
  learn: (id: string) =>
    req<{ player: PlayerState; revealed?: { name: string; combo: string }[] }>('/api/player/skill', { method: 'POST', json: { id } }),
  resetBuild: () => req<{ player: PlayerState }>('/api/player/reset', { method: 'POST', json: {} }),
  setJob: (job: string) => req<{ player: PlayerState }>('/api/player/job', { method: 'POST', json: { job } }),
  battle: () =>
    req<{ result: BattleResult; reward: { gold: number; item: Item | null } | null; player: PlayerState }>('/api/battle', {
      method: 'POST',
      json: {},
    }),
  bulk: (ids: string[], action: { status: Status } | { delete: true }) =>
    req<{ tasks?: Task[]; xp?: XpChange | null }>('/api/tasks/bulk', { method: 'POST', json: { ids, ...action } }),
  chest: () => req<{ item: Item; player: PlayerState }>('/api/chest', { method: 'POST', json: {} }),
  equip: (id: string, on: boolean) => req<{ player: PlayerState }>(`/api/items/${id}/equip`, { method: 'POST', json: { on } }),
  sell: (id: string) => req<{ player: PlayerState }>(`/api/items/${id}/sell`, { method: 'POST', json: {} }),
  missions: () => req<{ missions: Mission[] }>('/api/missions'),
  claim: (id: string) =>
    req<{ item: Item | null; gold: number; player: PlayerState; missions: Mission[] }>(`/api/missions/${id}/claim`, {
      method: 'POST',
      json: {},
    }),
  people: () => req<{ people: Person[] }>('/api/people'),
  person: (id: string) =>
    req<{ person: Pick<Person, 'id' | 'name' | 'picture'>; player: PlayerState; tasks: Task[] }>(`/api/people/${id}`),
  activity: () => req<{ activity: Activity[] }>('/api/activity'),
  // 管理者のみ
  renamePerson: (id: string, name: string) => req<{ name: string }>(`/api/admin/people/${id}/name`, { method: 'PATCH', json: { name } }),
  deleteActivity: (id: number) => req<{ ok: true }>(`/api/admin/activity/${id}`, { method: 'DELETE' }),
  clearActivity: () => req<{ ok: true; deleted: number }>('/api/admin/activity', { method: 'DELETE' }),
  remove: (id: string) => req<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  ai: (kind: 'split' | 'breakdown', text: string) =>
    req<{ tasks: string[] }>(`/api/ai/${kind}`, { method: 'POST', json: { text } }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
}

export type Mission = MissionDef & { value: number; done: boolean; claimed: boolean }

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
