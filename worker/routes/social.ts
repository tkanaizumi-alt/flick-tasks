/** 依頼・要対応・通知・履歴 */
import { isAllowed } from '../env'
import { aiReport } from '../ai'
import { classifyWeights, doneCutoff, countDaily, logActivity, notify } from '../game'
import { type AttentionItem, type Notice, type RequestItem, type Task, san, tagsOf } from '../../shared/types'
import { HISTORY_KEEP_DAYS, jstDayStart, jstToday } from '../../shared/game'
import { router, toTask, nameOf, TASK_SELECT, isDate, cleanTitle, cleanNote, isId, getTask, allowedUser, VISIBLE } from '../lib'

export const social = router()

// ---------- 依頼 ----------
/** 他の人にタスクを依頼する (相手のリストに入る)。followId は自分側の後続タスク */
social.post('/requests', async (c) => {
  const body = await c.req.json<{ to?: unknown; title?: unknown; note?: unknown; due?: unknown; followId?: unknown }>().catch(() => ({}) as any)
  const user = c.get('user')
  const to = await allowedUser(c.env, body.to)
  if (!to || to.id === user.id) return c.json({ error: '依頼先が見つかりません' }, 400)
  const title = cleanTitle(body.title)
  if (!title) return c.json({ error: 'title required' }, 400)
  const due = isDate(body.due) ? body.due : null
  const db = c.env.DB
  const follow = isId(body.followId) ? await db.prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?').bind(body.followId, user.id).first<{ id: string }>() : null
  const id = crypto.randomUUID()
  const now = Date.now()
  await db.batch([
    db
      .prepare(
        `INSERT INTO tasks (id, user_id, title, note, status, position, created_at, updated_at, source, requested_by, follow_id, due_date, due_by)
         VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, 'user', ?, ?, ?, ?)`,
      )
      .bind(id, to.id, title, cleanNote(body.note), now, now, now, user.id, follow?.id ?? null, due, due ? user.id : null),
    logActivity(db, user.id, 'request', `${title} → ${to.name}`),
    notify(db, to.id, user.id, 'request', id, `${san(user.name)}から依頼: 「${title}」${due ? `（${due.slice(5).replace('-', '/')}まで）` : ''}`),
  ])
  await countDaily(db, to.id, 'adds')
  c.executionCtx.waitUntil(classifyWeights(c.env, [{ id, title }]))
  return c.json({ task: await getTask(db, id) }, 201)
})

/** 自分が出した依頼 / 受けた依頼 (未完了と、完了から 7 日以内) */
social.get('/requests', async (c) => {
  const me = c.get('user').id
  const q = (where: string) =>
    c.env.DB.prepare(
      `SELECT x.*, o.id AS o_id, ${nameOf('o')} AS o_name, q.id AS q_id, ${nameOf('q')} AS q_name
         FROM (${TASK_SELECT} WHERE ${where} AND ${VISIBLE}) x
         JOIN users o ON o.id = x.user_id JOIN users q ON q.id = x.requested_by
        ORDER BY x.status = 'done', x.created_at DESC LIMIT 50`,
    )
      .bind(me, doneCutoff())
      .all<any>()
  const [sent, received] = await Promise.all([q('t.requested_by = ?'), q('t.user_id = ? AND t.requested_by IS NOT NULL')])
  const toItem = (r: any): RequestItem => ({ task: toTask(r), owner: { id: r.o_id, name: r.o_name }, requester: { id: r.q_id, name: r.q_name } })
  return c.json({ sent: sent.results.map(toItem), received: received.results.map(toItem) })
})

// ---------- 要対応・通知 ----------
const REASON_ORDER = { help: 0, wait: 1, late: 2, over: 3 }

/** 全員の フラグ付き・期限切れ の未完了タスク */
social.get('/attention', async (c) => {
  const me = c.get('user').id
  const { results } = await c.env.DB.prepare(
    `SELECT x.*, o.email AS o_email, ${nameOf('o')} AS o_name, o.picture AS o_picture, p.skin AS o_skin
       FROM (${TASK_SELECT} WHERE t.status <> 'done' AND (t.flag IS NOT NULL OR t.due_date < ?)) x
       JOIN users o ON o.id = x.user_id LEFT JOIN players p ON p.user_id = x.user_id
      LIMIT 100`,
  )
    .bind(jstToday())
    .all<any>()
  const items = results
    .filter((r) => isAllowed(c.env, r.o_email))
    .map((r): AttentionItem => {
      const task = toTask(r)
      return {
        task,
        owner: { id: r.user_id, name: r.o_name, picture: r.o_picture, skin: r.o_skin },
        reason: task.flag?.kind ?? 'over',
        mine: task.flag?.kind === 'wait' && task.flag.to?.id === me,
      }
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || REASON_ORDER[a.reason] - REASON_ORDER[b.reason] || (b.task.flag?.at ?? 0) - (a.task.flag?.at ?? 0))
  return c.json({ items })
})

/** お知らせ (新しい順に 20 件。?before= でさらに前を読む)。タスクの持ち主も返す (タップで開く用) */
social.get('/notifications', async (c) => {
  const me = c.get('user').id
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER
  const [list, count] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT n.*, COALESCE(${nameOf('u')}, 'Flick') AS a_name, COALESCE(u.picture, '') AS a_picture, p.skin AS a_skin, t.user_id AS task_owner
         FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN players p ON p.user_id = n.actor_id LEFT JOIN tasks t ON t.id = n.task_id
        WHERE n.user_id = ? AND n.created_at < ? ORDER BY n.created_at DESC LIMIT 21`,
    ).bind(me, before),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(me),
  ])
  const rows = list.results as any[]
  const notices: Notice[] = rows.slice(0, 20).map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    taskId: r.task_id,
    taskOwner: r.task_owner ?? null,
    actor: { id: r.actor_id, name: r.a_name, picture: r.a_picture, skin: r.a_skin },
    createdAt: r.created_at,
    read: !!r.read_at,
  }))
  return c.json({ notices, unread: (count.results[0] as any).n as number, more: rows.length > 20 })
})

social.post('/notifications/read', async (c) => {
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(Date.now(), c.get('user').id).run()
  return c.json({ ok: true })
})

// ---------- 履歴 (完了タスク) ----------
const dayStartOf = (d: string) => jstDayStart(Date.parse(`${d}T00:00:00+09:00`))

/** 期間 (JST の日付、両端を含む) に完了した自分のタスク */
async function history(c: any, from: unknown, to: unknown) {
  if (!isDate(from) || !isDate(to) || from > to) return null
  const start = dayStartOf(from)
  const end = dayStartOf(to) + 86400000
  if (end - start > HISTORY_KEEP_DAYS * 86400000) return null
  const { results } = await c.env.DB.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND t.status = 'done' AND t.done_at >= ? AND t.done_at < ? ORDER BY t.done_at`)
    .bind(c.get('user').id, start, end)
    .all()
  return results.map(toTask)
}

/** 週のふりかえり (新しい順に最大 12 週) */
social.get('/reports', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, period_from, period_to, text, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .bind(c.get('user').id)
    .all<any>()
  return c.json({ reports: results.map((r) => ({ id: r.id, from: r.period_from, to: r.period_to, text: r.text, createdAt: r.created_at })) })
})

social.get('/history', async (c) => {
  const tasks = await history(c, c.req.query('from'), c.req.query('to'))
  return tasks ? c.json({ tasks }) : c.json({ error: 'invalid range' }, 400)
})

/** 期間の完了タスクから AI で日報・月次報告の下書きを作る */
social.post('/history/report', async (c) => {
  const { from, to, tag } = await c.req.json<{ from?: string; to?: string; tag?: string | null }>().catch(() => ({}) as any)
  const all = await history(c, from, to)
  if (!all) return c.json({ error: 'invalid range' }, 400)
  // タグで絞り込んだ日報 (例: #A社 の分だけ)
  const tasks = typeof tag === 'string' && tag ? all.filter((t: Task) => tagsOf(t).includes(tag)) : all
  if (!tasks.length) return c.json({ error: 'この期間に完了したタスクはありません' }, 400)
  const day = (t: number) => new Date(t + 9 * 3600000).toISOString().slice(5, 10).replace('-', '/')
  const lines = tasks.slice(-200).map((t: Task) => `${day(t.doneAt ?? t.updatedAt)} ${t.parent ? `${t.parent.title} > ` : ''}${t.title}${t.note ? `（${t.note.slice(0, 60)}）` : ''}`)
  try {
    return c.json({ text: await aiReport(c.env, from === to ? from! : `${from} 〜 ${to}`, lines) })
  } catch (e) {
    console.error('report failed', e)
    return c.json({ error: 'ai unavailable' }, 503)
  }
})
