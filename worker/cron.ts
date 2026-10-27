import { displayName, isAllowed, type Env } from './env'
import { aiReport } from './ai'
import { jstDayStart, jstToday } from '../shared/game'

/** アプリからのお知らせの送り主 (users には居ない) */
export const SYSTEM_ACTOR = 'system'

const DAY = 86400000
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

async function allowedUsers(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, name, display_name, email FROM users').all<any>()
  return results.filter((u) => isAllowed(env, u.email))
}

const systemNotice = (env: Env, userId: string, kind: string, taskId: string | null, text: string) =>
  env.DB.prepare('INSERT INTO notifications (user_id, actor_id, kind, task_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
    userId,
    SYSTEM_ACTOR,
    kind,
    taskId,
    text,
    Date.now(),
  )

/** 毎朝: 今日・明日が期限のタスクと、期限切れの件数を本人に知らせる */
export async function dueReminders(env: Env) {
  const today = jstToday()
  const tomorrow = addDays(today, 1)
  const users = new Set((await allowedUsers(env)).map((u) => u.id))
  const { results } = await env.DB.prepare("SELECT id, user_id, title, due_date FROM tasks WHERE status <> 'done' AND due_date IS NOT NULL AND due_date <= ?")
    .bind(tomorrow)
    .all<any>()
  const stmts: D1PreparedStatement[] = []
  const overdue = new Map<string, number>()
  for (const t of results) {
    if (!users.has(t.user_id)) continue
    if (t.due_date === today) stmts.push(systemNotice(env, t.user_id, 'due', t.id, `⏰ 今日が期限です: 「${t.title}」`))
    else if (t.due_date === tomorrow) stmts.push(systemNotice(env, t.user_id, 'due', t.id, `⏰ 明日が期限です: 「${t.title}」`))
    else overdue.set(t.user_id, (overdue.get(t.user_id) ?? 0) + 1)
  }
  for (const [u, n] of overdue) stmts.push(systemNotice(env, u, 'due', null, `⚠️ 期限切れのタスクが${n}件あります`))
  if (stmts.length) await env.DB.batch(stmts)
  return stmts.length
}

/** 毎週金曜の夕方: その週 (月曜〜) に完了したタスクから AI でふりかえりを作り、本人に知らせる */
export async function weeklyReviews(env: Env) {
  const today = jstToday()
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  const monday = addDays(today, -((dow + 6) % 7))
  const start = jstDayStart(Date.parse(`${monday}T00:00:00+09:00`))
  let made = 0
  for (const u of await allowedUsers(env)) {
    const exists = await env.DB.prepare('SELECT 1 FROM reports WHERE user_id = ? AND period_from = ?').bind(u.id, monday).first()
    if (exists) continue
    const { results } = await env.DB.prepare(
      `SELECT t.title, t.note, t.done_at, p.title AS parent_title FROM tasks t LEFT JOIN tasks p ON p.id = t.parent_id
        WHERE t.user_id = ? AND t.status = 'done' AND t.done_at >= ? ORDER BY t.done_at LIMIT 200`,
    )
      .bind(u.id, start)
      .all<any>()
    if (!results.length) continue
    const day = (t: number) => new Date(t + 9 * 3600000).toISOString().slice(5, 10).replace('-', '/')
    const lines = results.map((t) => `${day(t.done_at)} ${t.parent_title ? `${t.parent_title} > ` : ''}${t.title}${t.note ? `（${String(t.note).slice(0, 60)}）` : ''}`)
    try {
      const text = await aiReport(env, `${monday} 〜 ${today}（${displayName(u)}さんの今週）`, lines)
      if (!text) continue
      await env.DB.batch([
        env.DB.prepare('INSERT INTO reports (user_id, period_from, period_to, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(u.id, monday, today, text, Date.now()),
        systemNotice(env, u.id, 'weekly', null, `📝 今週のふりかえりができました（${results.length}件完了）。「履歴」から見られます`),
      ])
      made++
    } catch (e) {
      console.error('weekly review failed', u.id, e)
    }
  }
  return made
}
