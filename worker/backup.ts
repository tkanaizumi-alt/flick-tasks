/**
 * 毎日のバックアップ: D1 の中身 (ログインのセッション以外) を JSON にして KV に 14 日分残す。
 * 戻し方は README の「データを戻す」と scripts/restore-backup.mjs
 */
import type { Env } from './env'

const KEEP_DAYS = 14
/** KV の 1 件の上限 (25MB) より少し小さく */
const MAX_BYTES = 24 * 1024 * 1024
const SKIP = new Set(['sessions', 'd1_migrations'])

export const backupKey = (day: string) => `backup:${day}`

export async function makeBackup(env: Env, day: string) {
  if (!env.BACKUP) return null
  const { results: tables } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{
    name: string
  }>()
  const data: Record<string, unknown[]> = {}
  for (const { name } of tables) {
    if (SKIP.has(name)) continue
    data[name] = (await env.DB.prepare(`SELECT * FROM "${name}"`).all()).results
  }
  const body = JSON.stringify({ app: 'flick', at: Date.now(), day, tables: data })
  if (body.length > MAX_BYTES) throw new Error(`backup too large: ${body.length} bytes`)
  await env.BACKUP.put(backupKey(day), body, {
    expirationTtl: KEEP_DAYS * 86400,
    metadata: { bytes: body.length, rows: Object.values(data).reduce((a, r) => a + r.length, 0) },
  })
  return body.length
}

export async function listBackups(env: Env) {
  if (!env.BACKUP) return []
  const { keys } = await env.BACKUP.list<{ bytes: number; rows: number }>({ prefix: 'backup:' })
  return keys.map((k) => ({ day: k.name.slice(7), bytes: k.metadata?.bytes ?? 0, rows: k.metadata?.rows ?? 0 })).sort((a, b) => b.day.localeCompare(a.day))
}
