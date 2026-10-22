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
}

export interface User {
  id: string
  email: string
  name: string
  picture: string
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
  kind: 'done' | 'levelup' | 'boss' | 'item' | 'job'
  text: string
  createdAt: number
}
