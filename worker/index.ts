import { Hono } from 'hono'
import type { Env, Vars } from './env'
import { auth, resolveUser } from './auth'
import { aiTasks } from './ai'
import { STATUSES, type Status, type Task } from '../shared/types'

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
})

const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '')
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)

api.get('/me', (c) => c.json({ user: c.get('user') }))

api.get('/tasks', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY position DESC')
    .bind(c.get('user').id)
    .all()
  return c.json({ tasks: results.map(toTask) })
})

api.post('/tasks', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const items: any[] = Array.isArray(body.tasks) ? body.tasks : [body]
  if (items.length === 0 || items.length > 50) return c.json({ error: 'invalid' }, 400)
  const now = Date.now()
  const userId = c.get('user').id
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
    })
  }
  await c.env.DB.batch(
    tasks.map((t) =>
      c.env.DB.prepare(
        `INSERT INTO tasks (id, user_id, title, note, status, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      ).bind(t.id, userId, t.title, t.note, t.status, t.position, t.createdAt, t.updatedAt),
    ),
  )
  return c.json({ tasks }, 201)
})

api.patch('/tasks/:id', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const sets: string[] = []
  const vals: unknown[] = []
  if (body.title !== undefined) {
    const t = cleanTitle(body.title)
    if (!t) return c.json({ error: 'title required' }, 400)
    sets.push('title = ?')
    vals.push(t)
  }
  if (typeof body.note === 'string') {
    sets.push('note = ?')
    vals.push(body.note.slice(0, 5000))
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return c.json({ error: 'invalid status' }, 400)
    sets.push('status = ?')
    vals.push(body.status)
  }
  if (typeof body.position === 'number') {
    sets.push('position = ?')
    vals.push(body.position)
  }
  if (!sets.length) return c.json({ error: 'nothing to update' }, 400)
  sets.push('updated_at = ?')
  vals.push(Date.now())
  const row = await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`)
    .bind(...vals, c.req.param('id'), c.get('user').id)
    .first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({ task: toTask(row) })
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

app.route('/api', api)

app.notFound((c) => c.json({ error: 'not found' }, 404))

export default app
