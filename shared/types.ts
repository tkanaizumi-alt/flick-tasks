export type Status = 'todo' | 'doing' | 'done'

export const STATUSES: Status[] = ['todo', 'doing', 'done']

export interface Task {
  id: string
  title: string
  note: string
  status: Status
  position: number
  createdAt: number
  updatedAt: number
  weight?: 'S' | 'M' | 'L' | null
  source?: 'user' | 'ai'
  xpAwarded?: number
  doneAt?: number | null
  /** 期限 (YYYY-MM-DD) */
  due?: string | null
  /** 期限を設定した人 (本人以外のときに表示) */
  dueBy?: { id: string; name: string } | null
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

export interface Activity {
  id: number
  userId: string
  name: string
  picture: string
  kind: 'todo' | 'doing' | 'done' | 'levelup' | 'boss' | 'item' | 'job' | 'skill'
  text: string
  createdAt: number
}
