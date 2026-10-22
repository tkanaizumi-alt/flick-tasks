import type { User } from '../shared/types'

export interface Env {
  DB: D1Database
  AI: Ai
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  DEV_LOGIN?: string
}

export interface Vars {
  user: User
}
