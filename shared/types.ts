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
}

export interface User {
  id: string
  email: string
  name: string
  picture: string
}
