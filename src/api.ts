import type { Activity, AttentionItem, Flag, Notice, Person, RequestItem, Status, Task, User } from '../shared/types'
import type { BattleResult, Item, MissionDef, PlayerState, StatKey, Weight } from '../shared/game'

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
  create: (tasks: (Partial<Task> & { parentId?: string })[], source: 'user' | 'ai' = 'user') =>
    req<{ tasks: Task[] }>('/api/tasks', { method: 'POST', json: { tasks, source } }),
  update: (id: string, patch: Partial<Pick<Task, 'title' | 'note' | 'status' | 'position' | 'priority'>>) =>
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
    req<{ person: Pick<Person, 'id' | 'name' | 'picture' | 'isMe'>; player: PlayerState; tasks: Task[] }>(`/api/people/${id}`),
  activity: (kind: FeedKind, opts: { before?: number; user?: string } = {}) =>
    req<{ activity: Activity[]; more: boolean; cursor: number | null }>(
      `/api/activity?${new URLSearchParams({ kind, ...(opts.before ? { before: String(opts.before) } : {}), ...(opts.user ? { user: opts.user } : {}) })}`,
    ),
  /** AI の分解案 (追加はしない) */
  breakdown: (id: string, title: string, note: string) =>
    req<{ tasks: string[]; remaining: number }>(`/api/tasks/${id}/breakdown`, { method: 'POST', json: { title, note } }),
  /** 他の人のタスクを 進行中 / 完了 に進める */
  moveOther: (id: string, status: 'doing' | 'done') => req<{ task: Task; xp: XpChange | null }>(`/api/tasks/${id}/move`, { method: 'POST', json: { status } }),
  /** 作業量の調整 (AI の判定から 1 段階まで) */
  setWeight: (id: string, weight: Weight) => req<{ task: Task }>(`/api/tasks/${id}/weight`, { method: 'PUT', json: { weight } }),
  /** 状況フラグ (null で解除) */
  setFlag: (id: string, flag: Flag | null, note = '', to: string | null = null) =>
    req<{ task: Task }>(`/api/tasks/${id}/flag`, { method: 'PUT', json: { flag, note, to } }),
  request: (body: { to: string; title: string; note?: string; due?: string | null; followId?: string | null }) =>
    req<{ task: Task }>('/api/requests', { method: 'POST', json: body }),
  requests: () => req<{ sent: RequestItem[]; received: RequestItem[] }>('/api/requests'),
  attention: () => req<{ items: AttentionItem[] }>('/api/attention'),
  notices: () => req<{ notices: Notice[]; unread: number }>('/api/notifications'),
  readNotices: () => req<{ ok: true }>('/api/notifications/read', { method: 'POST', json: {} }),
  history: (from: string, to: string) => req<{ tasks: Task[] }>(`/api/history?from=${from}&to=${to}`),
  report: (from: string, to: string) => req<{ text: string }>('/api/history/report', { method: 'POST', json: { from, to } }),
  setSkin: (skin: string | null) => req<{ player: PlayerState }>('/api/player/skin', { method: 'POST', json: { skin } }),
  /** 期限の設定 (自分・他の人のタスクどちらも可。null で解除) */
  setDue: (id: string, due: string | null) => req<{ task: Task }>(`/api/tasks/${id}/due`, { method: 'PUT', json: { due } }),
  // 管理者のみ
  renamePerson: (id: string, name: string) => req<{ name: string }>(`/api/admin/people/${id}/name`, { method: 'PATCH', json: { name } }),
  deleteActivity: (id: number) => req<{ ok: true }>(`/api/admin/activity/${id}`, { method: 'DELETE' }),
  clearActivity: (kind: FeedKind) => req<{ ok: true; deleted: number }>(`/api/admin/activity?kind=${kind}`, { method: 'DELETE' }),
  remove: (id: string) => req<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  ai: (kind: 'split' | 'breakdown', text: string) =>
    req<{ tasks: string[] }>(`/api/ai/${kind}`, { method: 'POST', json: { text } }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
}

/** 最近の動きのタブ */
export type FeedKind = 'all' | Status

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
