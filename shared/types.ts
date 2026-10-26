export type Status = 'todo' | 'doing' | 'done'

export const STATUSES: Status[] = ['todo', 'doing', 'done']

/** 状況フラグ: 確認待ち / 困っている / 遅れそう */
export type Flag = 'wait' | 'help' | 'late'

export const FLAGS: Record<Flag, { label: string; icon: string }> = {
  wait: { label: '確認待ち', icon: '⏳' },
  help: { label: '困っている', icon: '🆘' },
  late: { label: '遅れそう', icon: '⚠️' },
}

/** 重要度 (null は普通) */
export type Priority = 'high' | 'low'

export const PRIORITIES: { key: Priority | null; label: string }[] = [
  { key: 'high', label: '高' },
  { key: null, label: '中' },
  { key: 'low', label: '低' },
]

export interface Ref {
  id: string
  name: string
}

export interface Task {
  id: string
  title: string
  note: string
  status: Status
  position: number
  createdAt: number
  updatedAt: number
  /** 作業量 (本人が調整していればその値、なければ AI の判定) */
  weight?: 'S' | 'M' | 'L' | 'XL' | null
  /** AI の判定 (本人が調整できる範囲の基準) */
  weightAi?: 'S' | 'M' | 'L' | 'XL' | null
  source?: 'user' | 'ai'
  xpAwarded?: number
  doneAt?: number | null
  /** 期限 (YYYY-MM-DD) */
  due?: string | null
  /** 期限を設定した人 (本人以外のときに表示) */
  dueBy?: Ref | null
  /** 重要度 (null は普通) */
  priority?: Priority | null
  /** 分解元のタスク */
  parent?: { id: string; title: string; weight: 'S' | 'M' | 'L' | 'XL' | null; siblings: number } | null
  /** 分解した子タスクの数 / そのうち完了した数 */
  children?: { total: number; done: number } | null
  /** 状況フラグ (確認待ちなら待っている相手も) */
  flag?: { kind: Flag; note: string; to: Ref | null; at: number } | null
  /** このタスクを依頼した人 */
  requestedBy?: Ref | null
  /** 依頼した人側の後続タスク */
  follow?: { id: string; title: string } | null
  /** このタスクの前に待っている依頼 (自分が出した依頼) */
  waitingOn?: { id: string; title: string; status: Status; owner: Ref } | null
}

export interface User {
  id: string
  email: string
  name: string
  picture: string
  /** 他の人の名前変更・ログ削除ができる */
  isAdmin?: boolean
}

/** みんなの画面の 1 人分 */
export interface Person {
  id: string
  name: string
  picture: string
  skin?: string | null
  xp: number
  stage: number
  jobName: string
  jobIcon: string
  todo: number
  doing: number
  done: number
  today: number
  week: number
  isMe: boolean
}

export type ActivityKind = 'todo' | 'doing' | 'done' | 'flag' | 'request' | 'levelup' | 'boss' | 'item' | 'job' | 'skill'

export interface Activity {
  id: number
  userId: string
  name: string
  picture: string
  skin?: string | null
  kind: ActivityKind
  text: string
  createdAt: number
}

/** 要対応: フラグ付き・期限切れ・依頼中のタスク */
export interface AttentionItem {
  task: Task
  owner: Ref & { picture: string; skin?: string | null }
  reason: 'wait' | 'help' | 'late' | 'over'
  /** 自分宛て (自分の確認待ち / 自分への依頼) */
  mine: boolean
}

export interface Notice {
  id: number
  kind: 'request' | 'request_done' | 'request_deleted' | 'wait' | 'help' | 'moved'
  text: string
  taskId: string | null
  actor: Ref & { picture: string; skin?: string | null }
  createdAt: number
  read: boolean
}

/** 依頼の一覧 (出した / 受けた) */
export interface RequestItem {
  task: Task
  owner: Ref
  requester: Ref
}

/** 「○○さん」(名前がすでに さん・様 などで終わっていれば付けない) */
export const san = (name: string) => (/(さん|様|さま|くん|ちゃん)$/.test(name) ? name : `${name}さん`)
