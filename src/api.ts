import type { Activity, AttentionItem, Comment, Flag, Notice, Person, RequestItem, Status, Task, User } from '../shared/types'
import type { BattleResult, Enemy, Item, MissionDef, PlayerState, Slot, StatKey, Weight } from '../shared/game'
import type { AchievementDef, AchievementStats } from '../shared/achievements'
import type { ClientFeature } from '../shared/usage'

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
  player: () => req<{ player: PlayerState; stats?: AchievementStats; unlocked?: AchievementDef[] }>('/api/player'),
  setPet: (pet: string | null) => req<{ player: PlayerState }>('/api/player/pet', { method: 'POST', json: { pet } }),
  enhance: (id: string, by: 'item' | 'gold' = 'item') => req<{ player: PlayerState }>(`/api/items/${id}/enhance`, { method: 'POST', json: { by } }),
  buySkin: (id: string) => req<{ player: PlayerState }>(`/api/shop/skin/${id}`, { method: 'POST', json: {} }),
  buy: (id: string) => req<{ player: PlayerState; item: Item | null }>(`/api/shop/${id}`, { method: 'POST', json: {} }),
  raid: () => req<RaidState>('/api/raid'),
  claimRaid: () => req<{ gold: number; item: Item | null; player: PlayerState }>('/api/raid/claim', { method: 'POST', json: {} }),
  mvp: () => req<Mvp>('/api/mvp'),
  event: () => req<{ event: EventState | null }>('/api/event'),
  sparList: () => req<{ left: number; people: SparPerson[] }>('/api/spar'),
  spar: (id: string) => req<{ result: BattleResult }>(`/api/spar/${id}`, { method: 'POST', json: {} }),
  eventBoss: () => req<EventBossState>('/api/event/boss'),
  fightEventBoss: () =>
    req<{ result: BattleResult; reward: { gold: number; item: Item | null } | null; player: PlayerState }>('/api/event/boss', { method: 'POST', json: {} }),
  setTitle: (title: string | null) => req<{ player: PlayerState }>('/api/player/title', { method: 'POST', json: { title } }),
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
  /** 繰り返し (rule: daily / weekdays / weekly:N / monthly:N) */
  setRecurring: (id: string, rule: string) => req<{ task: Task }>(`/api/tasks/${id}/recurring`, { method: 'POST', json: { rule } }),
  stopRecurring: (rid: string) => req<{ ok: true }>(`/api/recurring/${rid}`, { method: 'DELETE' }),
  comments: (taskId: string) => req<{ comments: Comment[] }>(`/api/tasks/${taskId}/comments`),
  addComment: (taskId: string, text: string) => req<{ ok: true }>(`/api/tasks/${taskId}/comments`, { method: 'POST', json: { text } }),
  deleteComment: (id: number) => req<{ ok: true }>(`/api/comments/${id}`, { method: 'DELETE' }),
  /** 手動の並べ替え (上から順の ID) */
  reorder: (ids: string[]) => req<{ ok: true }>('/api/tasks/reorder', { method: 'POST', json: { ids } }),
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
  notices: (before?: number) => req<{ notices: Notice[]; unread: number; more: boolean }>(`/api/notifications${before ? `?before=${before}` : ''}`),
  readNotices: () => req<{ ok: true }>('/api/notifications/read', { method: 'POST', json: {} }),
  reports: () => req<{ reports: { id: number; from: string; to: string; text: string; createdAt: number }[] }>('/api/reports'),
  history: (from: string, to: string) => req<{ tasks: Task[] }>(`/api/history?from=${from}&to=${to}`),
  report: (from: string, to: string, tag: string | null = null) => req<{ text: string }>('/api/history/report', { method: 'POST', json: { from, to, tag } }),
  setSkin: (skin: string | null) => req<{ player: PlayerState }>('/api/player/skin', { method: 'POST', json: { skin } }),
  /** 期限の設定 (自分・他の人のタスクどちらも可。null で解除) */
  setDue: (id: string, due: string | null) => req<{ task: Task }>(`/api/tasks/${id}/due`, { method: 'PUT', json: { due } }),
  // 管理者のみ
  adminStats: () => req<AdminStats>('/api/admin/stats'),
  backups: () => req<{ backups: { day: string; bytes: number; rows: number }[]; enabled: boolean }>('/api/admin/backups'),
  backupNow: () => req<{ ok: true; bytes: number }>('/api/admin/backups', { method: 'POST', json: {} }),
  templates: () => req<{ templates: Template[] }>('/api/templates'),
  createTemplate: (name: string, items: string[]) => req<{ template: Template }>('/api/templates', { method: 'POST', json: { name, items } }),
  deleteTemplate: (id: string) => req<{ ok: true }>(`/api/templates/${id}`, { method: 'DELETE' }),
  calendar: () => req<{ url: string | null }>('/api/calendar'),
  makeCalendar: () => req<{ url: string }>('/api/calendar', { method: 'POST', json: {} }),
  stopCalendar: () => req<{ ok: true }>('/api/calendar', { method: 'DELETE' }),
  searchHistory: (q: string) => req<{ tasks: Task[]; more: boolean }>(`/api/history/search?q=${encodeURIComponent(q)}`),
  renamePerson: (id: string, name: string) => req<{ name: string }>(`/api/admin/people/${id}/name`, { method: 'PATCH', json: { name } }),
  deleteActivity: (id: number) => req<{ ok: true }>(`/api/admin/activity/${id}`, { method: 'DELETE' }),
  clearActivity: (kind: FeedKind) => req<{ ok: true; deleted: number }>(`/api/admin/activity?kind=${kind}`, { method: 'DELETE' }),
  remove: (id: string) => req<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  ai: (kind: 'split' | 'breakdown', text: string) =>
    req<{ tasks: string[] }>(`/api/ai/${kind}`, { method: 'POST', json: { text } }),
  /** 画面で起きたエラーをサーバーに記録する */
  log: (message: string, stack = '', path = location.pathname) => req<{ ok: boolean }>('/api/log', { method: 'POST', json: { message, stack, path } }),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),
}

/** 最近の動きのタブ */
export type FeedKind = 'all' | Status

type Who = { id: string; name: string; picture: string; skin: string | null }
export interface AdminStats {
  people: {
    id: string
    name: string
    level: number
    stage: number
    done7: number
    done30: number
    xp7: number
    added7: number
    open: number
    flags: number
    helps7: number
    comments7: number
    split30: number
    requested30: number
    recurring: number
    gold: number
    goldIn7: number
    goldOut7: number
  }[]
  totals: { done7: number; xpPerDone: number }
  errors: { id: number; source: 'server' | 'client'; path: string; message: string; who: string; at: number }[]
  usageSince: number | null
  features: { id: string; label: string; n: number; people: number }[]
  goldFlow: { id: string; label: string; gold: number; n: number }[]
}
export interface Template {
  id: string
  name: string
  items: string[]
  createdAt: number
}

/** 画面だけで完結する操作を、管理者の集計用に知らせる (1 回の表示につき 1 機能 1 回まで) */
const sentUsage = new Set<string>()
export function trackUsage(feature: ClientFeature, once = true) {
  if (once && sentUsage.has(feature)) return
  sentUsage.add(feature)
  req('/api/usage', { method: 'POST', json: { feature } }).catch(() => {})
}
export interface RaidState {
  week: string
  until: string
  boss: { name: string; icon: string; hp: number }
  damage: number
  defeated: boolean
  ranking: (Who & { damage: number })[]
  mine: number
  claimed: boolean
}
export interface Mvp {
  week: string
  until: string
  done: { value: number; winners: Who[] } | null
  xp: { value: number; winners: Who[] } | null
  helps: { value: number; winners: Who[] } | null
}
export interface EventState {
  id: string
  name: string
  icon: string
  end: string
  skin: { id: string; name: string; emoji: string }
  done: number
  got: boolean
}

export type Mission = MissionDef & { value: number; done: boolean; claimed: boolean }

export interface SparPerson {
  id: string
  name: string
  picture: string
  skin: string | null
  level: number
  stage: number
  wins: number
  losses: number
}
export interface EventBossState {
  event: { id: string; name: string; icon: string; end: string } | null
  boss?: Enemy
  gear?: { slot: Slot; name: string; owned: boolean }[]
  owned?: number
  tries?: number
  won?: boolean
  left?: number
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
