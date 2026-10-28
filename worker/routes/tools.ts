/** テンプレート・カレンダー配信・完了タスクの検索・画面からの利用の記録 */
import { CLIENT_FEATURES } from '../../shared/usage'
import { TASK_SELECT, cleanTitle, router, toTask } from '../lib'
import { track } from '../usage'

export const tools = router()

// ---------- テンプレート (よく使うタスクのセット) ----------
export const TEMPLATE_MAX = 30
export const TEMPLATE_ITEMS_MAX = 30

const toTemplate = (r: any) => ({ id: r.id as string, name: r.name as string, items: JSON.parse(r.items) as string[], createdAt: r.created_at as number })

tools.get('/templates', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at').bind(c.get('user').id).all()
  return c.json({ templates: results.map(toTemplate) })
})

tools.post('/templates', async (c) => {
  const body = await c.req.json<{ name?: unknown; items?: unknown }>().catch(() => ({}) as any)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : ''
  const items = (Array.isArray(body.items) ? body.items : []).map(cleanTitle).filter(Boolean).slice(0, TEMPLATE_ITEMS_MAX)
  if (!name) return c.json({ error: '名前を入れてください' }, 400)
  if (!items.length) return c.json({ error: 'タスクを1件以上入れてください' }, 400)
  const userId = c.get('user').id
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM templates WHERE user_id = ?').bind(userId).first<{ n: number }>()
  if ((n?.n ?? 0) >= TEMPLATE_MAX) return c.json({ error: `テンプレートは${TEMPLATE_MAX}個までです` }, 400)
  const row = { id: crypto.randomUUID(), user_id: userId, name, items: JSON.stringify(items), created_at: Date.now() }
  await c.env.DB.prepare('INSERT INTO templates (id, user_id, name, items, created_at) VALUES (?, ?, ?, ?, ?)').bind(row.id, userId, name, row.items, row.created_at).run()
  return c.json({ template: toTemplate(row) })
})

tools.delete('/templates/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('user').id).run()
  return c.json({ ok: true })
})

// ---------- カレンダー配信 (Google カレンダーなどに URL で登録) ----------
const newToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const calUrl = (origin: string, token: string) => `${origin}/cal/${token}.ics`

tools.get('/calendar', async (c) => {
  const r = await c.env.DB.prepare('SELECT token FROM cal_tokens WHERE user_id = ?').bind(c.get('user').id).first<{ token: string }>()
  return c.json({ url: r ? calUrl(new URL(c.req.url).origin, r.token) : null })
})

/** URL を作る (作り直すと前の URL は使えなくなる) */
tools.post('/calendar', async (c) => {
  const token = newToken()
  await c.env.DB.prepare('INSERT INTO cal_tokens (user_id, token, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at')
    .bind(c.get('user').id, token, Date.now())
    .run()
  return c.json({ url: calUrl(new URL(c.req.url).origin, token) })
})

tools.delete('/calendar', async (c) => {
  await c.env.DB.prepare('DELETE FROM cal_tokens WHERE user_id = ?').bind(c.get('user').id).run()
  return c.json({ ok: true })
})

// ---------- 完了タスクの検索 (履歴に残っている分すべて) ----------
tools.get('/history/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 50)
  if (!q) return c.json({ tasks: [] })
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const { results } = await c.env.DB.prepare(
    `${TASK_SELECT} WHERE t.user_id = ?1 AND t.status = 'done' AND (t.title LIKE ?2 ESCAPE '\\' OR t.note LIKE ?2 ESCAPE '\\')
      ORDER BY COALESCE(t.done_at, t.updated_at) DESC LIMIT 100`,
  )
    .bind(c.get('user').id, like)
    .all()
  // 古い順 (履歴の一覧と同じ並び) で返す
  return c.json({ tasks: results.map(toTask).reverse(), more: results.length >= 100 })
})

// ---------- 画面だけで完結する操作の記録 ----------
tools.post('/usage', async (c) => {
  const { feature } = await c.req.json<{ feature?: string }>().catch(() => ({}) as any)
  if (!(CLIENT_FEATURES as readonly string[]).includes(feature)) return c.json({ ok: false }, 400)
  await track(c.env.DB, c.get('user').id, feature).run()
  return c.json({ ok: true })
})
