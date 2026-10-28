/**
 * 期限付きタスクのカレンダー配信 (iCal)。Google カレンダーなどに「URL で追加」すると、
 * 未完了で期限のある自分のタスクが終日の予定として出る。URL の合言葉だけで読めるので、ログインは要らない
 */
import type { Env } from './env'
import { track } from './usage'

const DAY = 86400000

/** iCal の文字列のエスケープ */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** 1 行 75 バイトまで。超えたら折り返す (続きの行は空白で始める) */
function fold(line: string) {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

const ymd = (d: string) => d.replace(/-/g, '')
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + DAY).toISOString().slice(0, 10)
const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')

export function toIcs(tasks: { id: string; title: string; note: string; due_date: string; updated_at: number }[], origin: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flick//Tasks//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Flick の期限',
    'X-WR-TIMEZONE:Asia/Tokyo',
  ]
  for (const t of tasks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@flick`,
      `DTSTAMP:${stamp(t.updated_at)}`,
      `DTSTART;VALUE=DATE:${ymd(t.due_date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(t.due_date))}`,
      `SUMMARY:${esc(`⏰ ${t.title}`)}`,
      `DESCRIPTION:${esc([t.note, `${origin}/`].filter(Boolean).join('\n\n'))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

export async function calendarFeed(env: Env, file: string, origin: string, ctx: { waitUntil(p: Promise<unknown>): void }) {
  const token = file.replace(/\.ics$/, '')
  if (!/^[\w-]{20,64}$/.test(token)) return null
  const owner = await env.DB.prepare('SELECT user_id FROM cal_tokens WHERE token = ?').bind(token).first<{ user_id: string }>()
  if (!owner) return null
  const { results } = await env.DB.prepare(
    "SELECT id, title, note, due_date, updated_at FROM tasks WHERE user_id = ? AND status <> 'done' AND due_date IS NOT NULL ORDER BY due_date LIMIT 500",
  )
    .bind(owner.user_id)
    .all<any>()
  // カレンダーのアプリは数時間ごとに読みに来るので、記録は 1 日 1 回まで
  ctx.waitUntil(
    env.DB.prepare("SELECT 1 FROM usage WHERE user_id = ? AND feature = 'calendar' AND created_at >= ?")
      .bind(owner.user_id, Date.now() - DAY)
      .first()
      .then((seen) => (seen ? null : track(env.DB, owner.user_id, 'calendar').run()))
      .catch(() => {}),
  )
  return toIcs(results, origin)
}
