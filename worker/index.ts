import { Hono } from 'hono'
import type { Env, Vars } from './env'
import { auth, resolveUser } from './auth'
import { purgeOldDone } from './game'
import { dueReminders, weeklyReviews } from './cron'
import { tasks } from './routes/tasks'
import { social } from './routes/social'
import { game } from './routes/game'
import { people } from './routes/people'
import { admin } from './routes/admin'
import { canLogClient, recordError } from './errors'

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

// ルート (どれもログイン済みのユーザーだけ)
api.route('/', tasks)
api.route('/', social)
api.route('/', game)
api.route('/', people)
api.route('/admin', admin)

/** 画面で起きたエラーの報告 */
api.post('/log', async (c) => {
  const user = c.get('user')
  const body = await c.req.json<{ message?: unknown; stack?: unknown; path?: unknown }>().catch(() => ({}) as any)
  if (typeof body.message !== 'string' || !body.message) return c.json({ ok: false }, 400)
  if (await canLogClient(c.env, user.id)) {
    await recordError(c.env, { source: 'client', path: typeof body.path === 'string' ? body.path : '', message: body.message, stack: typeof body.stack === 'string' ? body.stack : '', userId: user.id })
  }
  return c.json({ ok: true })
})


app.route('/api', api)

app.notFound((c) => c.json({ error: 'not found' }, 404))

// 想定外のエラーは記録して (管理者の集計画面で見られる)、利用者には短いメッセージだけ返す
app.onError((err, c) => {
  c.executionCtx.waitUntil(
    recordError(c.env, { source: 'server', path: `${c.req.method} ${new URL(c.req.url).pathname}`, message: String(err?.message ?? err), stack: err?.stack, userId: c.get('user')?.id }),
  )
  return c.json({ error: 'server error' }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    // 毎朝 8:00 (JST): 期限のお知らせ
    if (event.cron === '0 23 * * *') ctx.waitUntil(dueReminders(env).then((n) => console.log('due reminders', n)))
    // 金曜 17:00 (JST): 今週のふりかえり
    else if (event.cron === '0 8 * * 5') ctx.waitUntil(weeklyReviews(env).then((n) => console.log('weekly reviews', n)))
    // 毎日 3:00 (JST): 古い履歴・ログ・通知を整理
    else ctx.waitUntil(purgeOldDone(env.DB).then((n) => console.log('purged done tasks', n)))
  },
} satisfies ExportedHandler<Env>
