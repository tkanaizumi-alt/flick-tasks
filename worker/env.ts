import type { User } from '../shared/types'

export interface Env {
  DB: D1Database
  AI: Ai
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  DEV_LOGIN?: string
  /** ログインを許可するメールアドレス (カンマ区切り)。未設定なら制限しない */
  ALLOWED_EMAILS?: string
  /** 管理者 (他の人の名前変更・ログ削除ができる) のメールアドレス (カンマ区切り) */
  ADMIN_EMAILS?: string
  /** 毎日のバックアップ (14 日分) */
  BACKUP?: KVNamespace
}

const emailList = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

export function isAllowed(env: Env, email: string) {
  const list = emailList(env.ALLOWED_EMAILS)
  return list.length === 0 || list.includes(email.toLowerCase())
}

export const isAdmin = (env: Env, email: string) => emailList(env.ADMIN_EMAILS).includes(email.toLowerCase())

/** 表示名 (管理者が付けた名前 → Google の名前 → メールの @ より前) */
export const displayName = (r: { display_name?: string | null; name?: string | null; email: string }) =>
  r.display_name || r.name || r.email.split('@')[0]

export interface Vars {
  user: User
}
