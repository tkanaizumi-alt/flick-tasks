import { Hono } from 'hono'
import { displayName, isAllowed, type Env, type Vars } from './env'
import { auth, resolveUser } from './auth'
import { aiTasks } from './ai'
import {
  addStat,
  applyTaskXp,
  claimMission,
  classifyWeights,
  doneCutoff,
  equipItem,
  fight,
  getMissions,
  getPlayer,
  learnSkill,
  openChest,
  purgeOldDone,
  resetBuild,
  sellItem,
  setJob,
} from './game'
import { JOB_MAP } from './jobs'
import { STATUSES, type Activity, type Person, type Status, type Task } from '../shared/types'
import { jstDayStart, type StatKey } from '../shared/game'

/** 完了から 7 日経ったタスクは (削除前でも) 返さない */
const VISIBLE = "NOT (status = 'done' AND COALESCE(done_at, updated_at) < ?)"

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

// 変更系リクエストは同一オリジンのみ許可 (CSRF 対策)
app.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: 'forbidden' }, 403)
  }
  await next()
})

app.route('/auth', auth)

const api = new Hono<{ Bindings: Env; Variables: Vars }>()

api.use('*', async (c, next) => {
  const user = await resolveUser(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
})

const toTask = (r: any): Task => ({
  id: r.id,
  title: r.title,
  note: r.note,
  status: r.status,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  weight: r.weight ?? null,
  source: r.source ?? 'user',
  xpAwarded: r.xp_awarded ?? 0,
  doneAt: r.done_at ?? null,
})

const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '')
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)

api.get('/me', (c) => c.json({ user: c.get('user') }))

api.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM tasks WHERE user_id = ? AND ${VISIBLE} ORDER BY position DESC`)
    .bind(c.get('user').id, doneCutoff())
    .all()
  return c.json({ tasks: results.map(toTask) })
})

api.post('/tasks', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const items: any[] = Array.isArray(body.tasks) ? body.tasks : [body]
  if (items.length === 0 || items.length > 50) return c.json({ error: 'invalid' }, 400)
  const now = Date.now()
  const userId = c.get('user').id
  const source = body.source === 'ai' ? 'ai' : 'user'
  const tasks: Task[] = []
  for (const [i, it] of items.entries()) {
    const title = cleanTitle(it.title)
    if (!title) return c.json({ error: 'title required' }, 400)
    tasks.push({
      id: isId(it.id) ? it.id : crypto.randomUUID(),
      title,
      note: typeof it.note === 'string' ? it.note.slice(0, 5000) : '',
      status: isStatus(it.status) ? it.status : 'todo',
      position: typeof it.position === 'number' ? it.position : now - i,
      createdAt: now,
      updatedAt: now,
      weight: null,
      source,
      xpAwarded: 0,
      doneAt: null,
    })
  }
  await c.env.DB.batch(
    tasks.map((t) =>
      c.env.DB.prepare(
        `INSERT INTO tasks (id, user_id, title, note, status, position, created_at, updated_at, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      ).bind(t.id, userId, t.title, t.note, t.status, t.position, t.createdAt, t.updatedAt, t.source),
    ),
  )
  // XP 用の重さ判定はレスポンスを待たせず裏で行う
  c.executionCtx.waitUntil(classifyWeights(c.env, tasks))
  return c.json({ tasks }, 201)
})

type Patch = { title?: unknown; note?: unknown; status?: unknown; position?: unknown }

/** タスク 1 件を更新し、ステータスが完了をまたいだら XP・ゴールドを付与/取り消す */
async function updateTask(db: D1Database, userId: string, id: string, body: Patch) {
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.title !== undefined) {
    const t = cleanTitle(body.title)
    if (!t) return { error: 'title required', code: 400 as const }
    sets.push('title = ?')
    vals.push(t)
  }
  if (typeof body.note === 'string') {
    sets.push('note = ?')
    vals.push(body.note.slice(0, 5000))
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return { error: 'invalid status', code: 400 as const }
    sets.push('status = ?')
    vals.push(body.status)
  }
  if (typeof body.position === 'number') {
    sets.push('position = ?')
    vals.push(body.position)
  }
  if (!sets.length) return { error: 'nothing to update', code: 400 as const }
  sets.push('updated_at = ?')
  vals.push(Date.now())
  const before = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(id, userId).first()
  if (!before) return { error: 'not found', code: 404 as const }
  await db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, id, userId).run()
  const xp = body.status !== undefined ? await applyTaskXp(db, userId, before, body.status as Status) : null
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first()
  return { task: toTask(row), xp }
}

api.patch('/tasks/:id', async (c) => {
  const body = await c.req.json<Patch>().catch(() => ({}))
  const r = await updateTask(c.env.DB, c.get('user').id, c.req.param('id'), body)
  if ('error' in r) return c.json({ error: r.error }, r.code)
  return c.json(r)
})

/** 選択した複数タスクのステータス変更・削除 */
api.post('/tasks/bulk', async (c) => {
  const body = await c.req.json<{ ids?: unknown; status?: unknown; delete?: boolean }>().catch(() => ({}) as any)
  const ids = Array.isArray(body.ids) ? body.ids.filter(isId).slice(0, 100) : []
  if (!ids.length) return c.json({ error: 'ids required' }, 400)
  const userId = c.get('user').id
  if (body.delete) {
    await c.env.DB.batch(ids.map((id: string) => c.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(id, userId)))
    return c.json({ ok: true })
  }
  if (!isStatus(body.status)) return c.json({ error: 'invalid status' }, 400)
  const tasks: Task[] = []
  const xp = { amount: 0, gold: 0, bonuses: [] as string[], level: 0, leveledUp: false }
  const now = Date.now()
  for (const [i, id] of ids.entries()) {
    const r = await updateTask(c.env.DB, userId, id, { status: body.status, position: now - i })
    if ('error' in r) continue
    tasks.push(r.task)
    if (r.xp) {
      xp.amount += r.xp.amount
      xp.gold += r.xp.gold
      xp.level = r.xp.level
      xp.leveledUp ||= r.xp.leveledUp
    }
  }
  return c.json({ tasks, xp: xp.amount ? xp : null })
})

api.delete('/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run()
  return c.json({ ok: true })
})

api.post('/ai/:kind', async (c) => {
  const kind = c.req.param('kind')
  if (kind !== 'split' && kind !== 'breakdown') return c.notFound()
  const { text } = await c.req.json<{ text?: string }>().catch(() => ({ text: '' }))
  const input = (text ?? '').trim().slice(0, 2000)
  if (!input) return c.json({ error: 'text required' }, 400)
  try {
    const tasks = await aiTasks(c.env, kind, input)
    return c.json({ tasks: tasks.length ? tasks : kind === 'split' ? [input.slice(0, 500)] : [] })
  } catch (e) {
    console.error('ai failed', e)
    return c.json({ error: 'ai unavailable' }, 503)
  }
})

// ---------- ゲーム ----------
const gameResponse = (c: any, r: { error?: string; player?: unknown }) =>
  r.error ? c.json({ error: r.error }, 400) : c.json({ player: r.player })

api.get('/player', async (c) => c.json({ player: await getPlayer(c.env.DB, c.get('user').id) }))

api.post('/player/stat', async (c) => {
  const { stat } = await c.req.json<{ stat?: StatKey }>().catch(() => ({ stat: undefined }))
  return gameResponse(c, await addStat(c.env.DB, c.get('user').id, stat as StatKey))
})

api.post('/player/skill', async (c) => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({ id: '' }))
  const r = await learnSkill(c.env.DB, c.get('user').id, id ?? '')
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

api.post('/player/reset', async (c) => gameResponse(c, await resetBuild(c.env.DB, c.get('user').id)))

api.post('/player/job', async (c) => {
  const { job } = await c.req.json<{ job?: string }>().catch(() => ({ job: '' }))
  return gameResponse(c, await setJob(c.env.DB, c.get('user').id, job ?? ''))
})

api.post('/battle', async (c) => c.json(await fight(c.env.DB, c.get('user').id)))

api.post('/chest', async (c) => {
  const r = await openChest(c.env.DB, c.get('user').id)
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

api.post('/items/:id/equip', async (c) => {
  const { on } = await c.req.json<{ on?: boolean }>().catch(() => ({ on: true }))
  return gameResponse(c, await equipItem(c.env.DB, c.get('user').id, c.req.param('id'), on !== false))
})

api.post('/items/:id/sell', async (c) => gameResponse(c, await sellItem(c.env.DB, c.get('user').id, c.req.param('id'))))

api.get('/missions', async (c) => c.json(await getMissions(c.env.DB, c.get('user').id)))

api.post('/missions/:id/claim', async (c) => {
  const r = await claimMission(c.env.DB, c.get('user').id, c.req.param('id'))
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

// ---------- みんな ----------
api.get('/people', async (c) => {
  const now = Date.now()
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.display_name, u.email, u.picture, COALESCE(p.xp, 0) AS xp, COALESCE(p.stage, 1) AS stage, p.job AS job,
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
  const people: Person[] = (results as any[])
    .filter((r) => isAllowed(c.env, r.email))
    .map((r) => ({
      id: r.id,
      name: displayName(r),
      picture: r.picture,
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

api.get('/people/:id', async (c) => {
  const id = c.req.param('id')
  const user = await c.env.DB.prepare('SELECT id, name, display_name, email, picture FROM users WHERE id = ?').bind(id).first<any>()
  if (!user || !isAllowed(c.env, user.email)) return c.json({ error: 'not found' }, 404)
  const [player, { results }] = await Promise.all([
    getPlayer(c.env.DB, id),
    c.env.DB.prepare(`SELECT * FROM tasks WHERE user_id = ? AND ${VISIBLE} ORDER BY position DESC LIMIT 200`).bind(id, doneCutoff()).all(),
  ])
  return c.json({
    person: { id: user.id, name: displayName(user), picture: user.picture },
    player,
    tasks: results.map(toTask),
  })
})

api.get('/activity', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.user_id, a.kind, a.text, a.created_at, u.name, u.display_name, u.email, u.picture
       FROM activity a JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT 40`,
  ).all()
  const activity: Activity[] = (results as any[])
    .filter((r) => isAllowed(c.env, r.email))
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: displayName(r),
      picture: r.picture,
      kind: r.kind,
      text: r.text,
      createdAt: r.created_at,
    }))
  return c.json({ activity })
})

// ---------- 管理者のみ ----------
const admin = new Hono<{ Bindings: Env; Variables: Vars }>()
admin.use('*', async (c, next) => {
  if (!c.get('user').isAdmin) return c.json({ error: 'forbidden' }, 403)
  await next()
})

/** 他の人の表示名を変更 (空にすると Google の名前に戻る) */
admin.patch('/people/:id/name', async (c) => {
  const id = c.req.param('id')
  if (id === c.get('user').id) return c.json({ error: '自分の名前は変更できません' }, 400)
  const { name } = await c.req.json<{ name?: unknown }>().catch(() => ({ name: '' }))
  const value = typeof name === 'string' ? name.trim().slice(0, 30) : ''
  const r = await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(value || null, id).run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  const user = await c.env.DB.prepare('SELECT name, display_name, email FROM users WHERE id = ?').bind(id).first<any>()
  return c.json({ name: displayName(user) })
})

/** 最近の動きのログを 1 件削除 */
admin.delete('/activity/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM activity WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/** 最近の動きのログをすべて削除 */
admin.delete('/activity', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM activity').run()
  return c.json({ ok: true, deleted: r.meta.changes ?? 0 })
})

api.route('/admin', admin)

app.route('/api', api)

app.notFound((c) => c.json({ error: 'not found' }, 404))

export default {
  fetch: app.fetch,
  // 毎日 3:00 (JST) に完了から 7 日経ったタスクを削除
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeOldDone(env.DB).then((n) => console.log('purged done tasks', n)))
  },
} satisfies ExportedHandler<Env>
