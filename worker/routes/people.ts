/** みんな (メンバー・最近の動き) */
import { displayName, isAllowed } from '../env'
import { doneCutoff, getPlayer } from '../game'
import { streaks } from '../achievements'
import { JOB_MAP } from '../jobs'
import type { Activity, Person } from '../../shared/types'
import { jstDayStart } from '../../shared/game'
import { router, toTask, TASK_SELECT, isId, VISIBLE } from '../lib'

export const people = router()

// ---------- みんな ----------
people.get('/people', async (c) => {
  const now = Date.now()
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.display_name, u.email, u.picture, COALESCE(p.xp, 0) AS xp, COALESCE(p.stage, 1) AS stage, p.job AS job, p.skin AS skin, p.title AS title,
            SUM(t.status = 'todo') AS todo, SUM(t.status = 'doing') AS doing,
            SUM(t.status = 'done' AND COALESCE(t.done_at, t.updated_at) >= ?) AS done,
            SUM(t.done_at >= ? AND t.xp_awarded > 0) AS today, SUM(t.done_at >= ? AND t.xp_awarded > 0) AS week
       FROM users u
       LEFT JOIN players p ON p.user_id = u.id
       LEFT JOIN tasks t ON t.user_id = u.id
      GROUP BY u.id`,
  )
    .bind(doneCutoff(), jstDayStart(now), jstDayStart(now) - 6 * 86400000)
    .all()
  const me = c.get('user').id
  const streak = await streaks(c.env.DB)
  const people: Person[] = (results as any[])
    .filter((r) => isAllowed(c.env, r.email))
    .map((r) => ({
      id: r.id,
      name: displayName(r),
      picture: r.picture,
      skin: r.skin ?? null,
      title: r.title ?? null,
      streak: streak.get(r.id) ?? 0,
      xp: r.xp,
      stage: r.stage,
      jobName: (JOB_MAP[r.job] ?? JOB_MAP.warrior).name,
      jobIcon: (JOB_MAP[r.job] ?? JOB_MAP.warrior).icon,
      todo: r.todo ?? 0,
      doing: r.doing ?? 0,
      done: r.done ?? 0,
      today: r.today ?? 0,
      week: r.week ?? 0,
      isMe: r.id === me,
    }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || b.xp - a.xp)
  return c.json({ people })
})

people.get('/people/:id', async (c) => {
  const id = c.req.param('id')
  const user = await c.env.DB.prepare('SELECT id, name, display_name, email, picture FROM users WHERE id = ?').bind(id).first<any>()
  if (!user || !isAllowed(c.env, user.email)) return c.json({ error: 'not found' }, 404)
  const [player, { results }] = await Promise.all([
    getPlayer(c.env.DB, id),
    c.env.DB.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND ${VISIBLE} ORDER BY t.position DESC LIMIT 200`).bind(id, doneCutoff()).all(),
  ])
  return c.json({
    person: { id: user.id, name: displayName(user), picture: user.picture, isMe: user.id === c.get('user').id },
    player,
    tasks: results.map(toTask),
  })
})

/** 最近の動きに出す種類 (タスクに関するものだけ。撃破・レベルアップなどは出さない) */
export const FEED_KINDS = ['todo', 'doing', 'done', 'flag', 'request']
const FEED_PAGE = 30

/** 最近の動き。?kind=all|todo|doing|done、?user= で人を絞り込み、?before= でさらに前を読む */
people.get('/activity', async (c) => {
  const q = c.req.query('kind')
  const kinds = q === 'todo' || q === 'doing' || q === 'done' ? [q] : FEED_KINDS
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER
  const user = c.req.query('user')
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.user_id, a.kind, a.text, a.created_at, u.name, u.display_name, u.email, u.picture, p.skin
       FROM activity a JOIN users u ON u.id = a.user_id LEFT JOIN players p ON p.user_id = a.user_id
      WHERE a.kind IN (${kinds.map(() => '?').join(',')}) AND a.created_at < ? ${isId(user) ? 'AND a.user_id = ?' : ''}
      ORDER BY a.created_at DESC LIMIT ${FEED_PAGE + 1}`,
  )
    .bind(...kinds, before, ...(isId(user) ? [user] : []))
    .all()
  const rows = results as any[]
  const activity: Activity[] = rows
    .slice(0, FEED_PAGE)
    .filter((r) => isAllowed(c.env, r.email))
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: displayName(r),
      picture: r.picture,
      skin: r.skin ?? null,
      kind: r.kind,
      text: r.text,
      createdAt: r.created_at,
    }))
  return c.json({ activity, more: rows.length > FEED_PAGE, cursor: rows[Math.min(rows.length, FEED_PAGE) - 1]?.created_at ?? null })
})
