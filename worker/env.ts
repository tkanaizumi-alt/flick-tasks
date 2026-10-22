import type { User } from '../shared/types'

export interface Env {
  DB: D1Database
  AI: Ai
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  DEV_LOGIN?: string
  /** ログインを許可するメールアドレス (カンマ区切り)。未設定なら制限しない */
  ALLOWED_EMAILS?: string
}

export function isAllowed(env: Env, email: string) {
  const list = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return list.length === 0 || list.includes(email.toLowerCase())
}

export interface Vars {
  user: User
}
