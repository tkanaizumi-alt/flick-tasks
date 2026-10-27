import { Hono } from 'hono'
import { displayName, isAllowed, type Env, type Vars } from './env'
import { auth, resolveUser } from './auth'
import { aiReport, aiTasks } from './ai'
import {
  addStat,
  applyTaskXp,
  awardHelp,
  claimMission,
  classifyWeights,
  doneCutoff,
  equipItem,
  fight,
  getMissions,
  countDaily,
  getPlayer,
  logActivity,
  learnSkill,
  notify,
  openChest,
  purgeOldDone,
  resetBuild,
  sellItem,
  setJob,
  setSkin,
  setTitle,
  setPet,
  enhanceItem,
  buyShop,
} from './game'
import { claimRaid, lastWeekMvp, raidState } from './raid'
import type { ShopId } from '../shared/extras'
import { eventProgress, streaks, syncAchievements } from './achievements'
import { dueReminders, weeklyReviews } from './cron'
import { JOB_MAP } from './jobs'
import {
  FLAGS,
  STATUSES,
  type Activity,
  type AttentionItem,
  type Flag,
  type Notice,
  type Person,
  type RequestItem,
  type Status,
  type Task,
  type User,
  san,
  tagsOf,
} from '../shared/types'
import { isRule, ruleMatches } from '../shared/recurring'
import { BREAKDOWN_MAX, HISTORY_KEEP_DAYS, helpXp, jstDayStart, jstToday, weightChoices, type StatKey, type Weight } from '../shared/game'

/** 完了から 7 日経ったタスクはボードに返さない (履歴には残る) */
const VISIBLE = "NOT (t.status = 'done' AND COALESCE(t.done_at, t.updated_at) < ?)"

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

const ref = (id: unknown, name: unknown) => (id ? { id: id as string, name: (name as string) ?? '' } : null)

const toTask = (r: any): Task => ({
  id: r.id,
  title: r.title,
  note: r.note,
  status: r.status,
  position: r.position,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  weight: r.weight_user ?? r.weight ?? null,
  weightAi: r.weight ?? null,
  source: r.source ?? 'user',
  xpAwarded: r.xp_awarded ?? 0,
  doneAt: r.done_at ?? null,
  due: r.due_date ?? null,
  priority: r.priority === 'high' || r.priority === 'low' ? r.priority : null,
  dueBy: r.due_by && r.due_by !== r.user_id ? ref(r.due_by, r.due_by_name) : null,
  parent: r.parent_id ? { id: r.parent_id, title: r.parent_title ?? '', weight: r.parent_weight ?? null, siblings: r.sibling_total || 1 } : null,
  children: r.child_total ? { total: r.child_total, done: r.child_done ?? 0 } : null,
  flag: r.flag ? { kind: r.flag, note: r.flag_note ?? '', to: ref(r.flag_to, r.flag_to_name), at: r.flag_at ?? 0 } : null,
  requestedBy: ref(r.requested_by, r.requested_by_name),
  follow: r.follow_id && r.follow_title != null ? { id: r.follow_id, title: r.follow_title } : null,
  recurring: r.recurring_id && r.recurring_rule ? { id: r.recurring_id, rule: r.recurring_rule } : null,
  comments: r.comment_count ?? 0,
  waitingOn: r.wait_id ? { id: r.wait_id, title: r.wait_title, status: r.wait_status, owner: { id: r.wait_owner, name: r.wait_owner_name ?? '' } } : null,
})

/** 表示名 (管理者が付けた名前 → Google の名前 → メールの @ より前) を SQL で */
const nameOf = (a: string) => `COALESCE(${a}.display_name, ${a}.name, substr(${a}.email, 1, instr(${a}.email, '@') - 1))`

/** タスク + 期限を設定した人・分解元・子タスクの進み具合・フラグ・依頼の情報 */
const TASK_SELECT = `SELECT t.*, ${nameOf('du')} AS due_by_name,
    pt.title AS parent_title, COALESCE(pt.weight_user, pt.weight) AS parent_weight,
    CASE WHEN t.parent_id IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.parent_id) END AS sibling_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS child_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.status = 'done') AS child_done,
    ${nameOf('fu')} AS flag_to_name, ${nameOf('ru')} AS requested_by_name, ft.title AS follow_title,
    rc.rule AS recurring_rule, (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
    w.id AS wait_id, w.title AS wait_title, w.status AS wait_status, w.user_id AS wait_owner, ${nameOf('wu')} AS wait_owner_name
  FROM tasks t
  LEFT JOIN users du ON du.id = t.due_by
  LEFT JOIN tasks pt ON pt.id = t.parent_id
  LEFT JOIN users fu ON fu.id = t.flag_to
  LEFT JOIN users ru ON ru.id = t.requested_by
  LEFT JOIN tasks ft ON ft.id = t.follow_id
  LEFT JOIN tasks w ON w.id = (SELECT r.id FROM tasks r WHERE r.follow_id = t.id ORDER BY r.created_at DESC LIMIT 1)
  LEFT JOIN users wu ON wu.id = w.user_id
  LEFT JOIN recurring rc ON rc.id = t.recurring_id`
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '')
const cleanNote = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5000) : '')
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
const STATUS_LABEL_JA: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' }
const isFlag = (v: unknown): v is Flag => typeof v === 'string' && v in FLAGS
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)

const getTask = async (db: D1Database, id: string) => {
  const row = await db.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first()
  return row ? toTask(row) : null
}

/** ログインできる (ALLOWED_EMAILS に入っている) ユーザー */
async function allowedUsers(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, name, display_name, email, picture FROM users').all<any>()
  return results.filter((u) => isAllowed(env, u.email)).map((u) => ({ id: u.id as string, name: displayName(u), picture: u.picture as string }))
}

async function allowedUser(env: Env, id: unknown) {
  if (!isId(id)) return null
  const u = await env.DB.prepare('SELECT id, name, display_name, email FROM users WHERE id = ?').bind(id).first<any>()
  return u && isAllowed(env, u.email) ? { id: u.id as string, name: displayName(u) } : null
}

api.get('/me', (c) => c.json({ user: c.get('user') }))

api.get('/tasks', async (c) => {
  // 繰り返しタスクの今日の分を (まだなら) 作ってから返す。作業量の判定は裏で
  const made = await ensureRecurring(c.env.DB, c.get('user').id)
  if (made.length) c.executionCtx.waitUntil(classifyWeights(c.env, made))
  const { results } = await c.env.DB.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND ${VISIBLE} ORDER BY t.position DESC`)
    .bind(c.get('user').id, doneCutoff())
    .all()
  return c.json({ tasks: results.map(toTask) })
})

/** 期限の設定。自分のタスクにも他の人のタスクにも設定できる (空で解除) */
api.put('/tasks/:id/due', async (c) => {
  const { due } = await c.req.json<{ due?: unknown }>().catch(() => ({ due: null }))
  if (due !== null && due !== '' && !isDate(due)) return c.json({ error: 'invalid date' }, 400)
  const id = c.req.param('id')
  const owner = await c.env.DB.prepare('SELECT u.email FROM tasks t JOIN users u ON u.id = t.user_id WHERE t.id = ?').bind(id).first<{ email: string }>()
  if (!owner || !isAllowed(c.env, owner.email)) return c.json({ error: 'not found' }, 404)
  const value = due ? (due as string) : null
  await c.env.DB.prepare('UPDATE tasks SET due_date = ?, due_by = ?, updated_at = ? WHERE id = ?')
    .bind(value, value ? c.get('user').id : null, Date.now(), id)
    .run()
  return c.json({ task: await getTask(c.env.DB, id) })
})

/** 状況フラグ (確認待ち / 困っている / 遅れそう) の設定。自分のタスクのみ。null で解除 */
api.put('/tasks/:id/flag', async (c) => {
  const body = await c.req.json<{ flag?: unknown; note?: unknown; to?: unknown }>().catch(() => ({}) as any)
  const user = c.get('user')
  const id = c.req.param('id')
  const task = await c.env.DB.prepare('SELECT id, title, status FROM tasks WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>()
  if (!task) return c.json({ error: 'not found' }, 404)
  const db = c.env.DB
  if (body.flag === null || body.flag === undefined) {
    await db.prepare('UPDATE tasks SET flag = NULL, flag_note = NULL, flag_to = NULL, flag_at = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), id).run()
    return c.json({ task: await getTask(db, id) })
  }
  if (!isFlag(body.flag)) return c.json({ error: 'invalid flag' }, 400)
  const flag: Flag = body.flag
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : ''
  const to = flag === 'wait' ? await allowedUser(c.env, body.to) : null
  const now = Date.now()
  const label = `${FLAGS[flag].icon} ${FLAGS[flag].label}`
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE tasks SET flag = ?, flag_note = ?, flag_to = ?, flag_at = ?, updated_at = ? WHERE id = ?').bind(flag, note, to?.id ?? null, now, now, id),
    logActivity(db, user.id, 'flag', `${task.title}（${label}${to ? ` → ${to.name}` : ''}）`),
  ]
  const detail = note ? `「${task.title}」${note}` : `「${task.title}」`
  if (to) stmts.push(notify(db, to.id, user.id, 'wait', id, `${san(user.name)}があなたの確認を待っています: ${detail}`))
  if (flag === 'help') {
    for (const u of await allowedUsers(c.env)) stmts.push(notify(db, u.id, user.id, 'help', id, `${san(user.name)}が困っています: ${detail}`))
  }
  await db.batch(stmts)
  return c.json({ task: await getTask(db, id) })
})

/** 作業量の調整。AI の判定から 1 段階まで、未完了・分解した子タスク以外の自分のタスクのみ */
api.put('/tasks/:id/weight', async (c) => {
  const { weight } = await c.req.json<{ weight?: unknown }>().catch(() => ({ weight: undefined }))
  const id = c.req.param('id')
  const t = await c.env.DB.prepare('SELECT weight, status, parent_id FROM tasks WHERE id = ? AND user_id = ?').bind(id, c.get('user').id).first<any>()
  if (!t) return c.json({ error: 'not found' }, 404)
  if (t.status === 'done') return c.json({ error: '完了したタスクは変更できません' }, 400)
  if (t.parent_id) return c.json({ error: '分解したタスクのXPは元タスクから分配されます' }, 400)
  if (!t.weight) return c.json({ error: 'AIの判定が終わってから変更できます' }, 400)
  if (!weightChoices(t.weight).includes(weight as Weight)) return c.json({ error: 'AIの判定から1段階までです' }, 400)
  await c.env.DB.prepare('UPDATE tasks SET weight_user = ?, updated_at = ? WHERE id = ?')
    .bind(weight === t.weight ? null : weight, Date.now(), id)
    .run()
  return c.json({ task: await getTask(c.env.DB, id) })
})

api.post('/tasks', async (c) => {
  const body = await c.req.json<any>().catch(() => ({}))
  const items: any[] = Array.isArray(body.tasks) ? body.tasks : [body]
  if (items.length === 0 || items.length > 50) return c.json({ error: 'invalid' }, 400)
  const now = Date.now()
  const userId = c.get('user').id
  const source = body.source === 'ai' ? 'ai' : 'user'
  const db = c.env.DB
  // 分解した子タスク: 元タスクは自分のもので、それ自体が子タスクではないこと (分解は 1 段まで)
  const parentIds = [...new Set(items.map((it) => it.parentId ?? it.parent?.id).filter(isId))] as string[]
  const parents = new Map<string, number>()
  for (const pid of parentIds) {
    const p = await db
      .prepare('SELECT p.parent_id, (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = p.id) AS n FROM tasks p WHERE p.id = ? AND p.user_id = ?')
      .bind(pid, userId)
      .first<{ parent_id: string | null; n: number }>()
    if (p && !p.parent_id) parents.set(pid, p.n)
  }
  const tasks: (Task & { parentId: string | null })[] = []
  for (const [i, it] of items.entries()) {
    const title = cleanTitle(it.title)
    if (!title) return c.json({ error: 'title required' }, 400)
    const pid = it.parentId ?? it.parent?.id
    tasks.push({
      id: isId(it.id) ? it.id : crypto.randomUUID(),
      title,
      note: cleanNote(it.note),
      status: isStatus(it.status) ? it.status : 'todo',
      position: typeof it.position === 'number' ? it.position : now - i,
      createdAt: now,
      updatedAt: now,
      weight: null,
      source,
      xpAwarded: 0,
      doneAt: null,
      parentId: parents.has(pid) ? pid : null,
      // 取り消しで戻すときに重要度も戻す
      priority: it.priority === 'high' || it.priority === 'low' ? it.priority : null,
    })
  }
  // 同じ ID の再送 (オフライン復帰・取り消し) は二重に記録しない
  const exists = new Set(
    (
      await db
        .prepare(`SELECT id FROM tasks WHERE id IN (${tasks.map(() => '?').join(',')})`)
        .bind(...tasks.map((t) => t.id))
        .all()
    ).results.map((r: any) => r.id),
  )
  for (const [pid, n] of parents) {
    const adding = tasks.filter((t) => t.parentId === pid && !exists.has(t.id)).length
    if (n + adding > BREAKDOWN_MAX) return c.json({ error: `分解は${BREAKDOWN_MAX}件までです` }, 400)
  }
  const added = tasks.filter((t) => !exists.has(t.id) && t.status === 'todo')
  await db.batch([
    ...tasks.map((t) =>
      db
        .prepare(
          `INSERT INTO tasks (id, user_id, title, note, status, position, created_at, updated_at, source, parent_id, priority)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        )
        .bind(t.id, userId, t.title, t.note, t.status, t.position, t.createdAt, t.updatedAt, t.source, t.parentId, t.priority ?? null),
    ),
    ...added.map((t) => logActivity(db, userId, 'todo', t.title)),
  ])
  if (added.length) await countDaily(db, userId, 'adds', added.length)
  // XP 用の重さ判定はレスポンスを待たせず裏で行う
  c.executionCtx.waitUntil(classifyWeights(c.env, tasks))
  const { results } = await db
    .prepare(`${TASK_SELECT} WHERE t.id IN (${tasks.map(() => '?').join(',')})`)
    .bind(...tasks.map((t) => t.id))
    .all()
  const byId = new Map(results.map((r: any) => [r.id, toTask(r)]))
  return c.json({ tasks: tasks.map((t) => byId.get(t.id)).filter(Boolean) }, 201)
})

/** AI による分解案 (まだ追加しない。確認画面で編集してから POST /tasks で parentId 付きで追加する) */
api.post('/tasks/:id/breakdown', async (c) => {
  const id = c.req.param('id')
  const t = await c.env.DB.prepare('SELECT title, note, parent_id, (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tasks.id) AS n FROM tasks WHERE id = ? AND user_id = ?')
    .bind(id, c.get('user').id)
    .first<any>()
  if (!t) return c.json({ error: 'not found' }, 404)
  if (t.parent_id) return c.json({ error: '分解したタスクはさらに分解できません' }, 400)
  const remaining = BREAKDOWN_MAX - t.n
  if (remaining <= 0) return c.json({ error: `分解は${BREAKDOWN_MAX}件までです` }, 400)
  const { title, note } = await c.req.json<{ title?: string; note?: string }>().catch(() => ({}) as any)
  const input = [cleanTitle(title) || t.title, (typeof note === 'string' ? note : t.note).slice(0, 1500)].filter(Boolean).join('\n')
  try {
    const tasks = await aiTasks(c.env, 'breakdown', input)
    return c.json({ tasks: tasks.slice(0, remaining), remaining })
  } catch (e) {
    console.error('ai failed', e)
    return c.json({ error: 'ai unavailable' }, 503)
  }
})

type Patch = { title?: unknown; note?: unknown; status?: unknown; position?: unknown; priority?: unknown }

/** タスク 1 件を更新し、ステータスが完了をまたいだら XP・ゴールドを付与/取り消す */
async function updateTask(db: D1Database, user: User, id: string, body: Patch) {
  const userId = user.id
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
    vals.push(cleanNote(body.note))
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return { error: 'invalid status', code: 400 as const }
    sets.push('status = ?')
    vals.push(body.status)
    // 完了したらフラグ (確認待ちなど) は外す
    if (body.status === 'done') sets.push('flag = NULL, flag_note = NULL, flag_to = NULL, flag_at = NULL')
  }
  if (body.priority !== undefined) {
    if (body.priority !== null && body.priority !== 'high' && body.priority !== 'low') return { error: 'invalid priority', code: 400 as const }
    sets.push('priority = ?')
    vals.push(body.priority)
  }
  if (typeof body.position === 'number') {
    sets.push('position = ?')
    vals.push(body.position)
  }
  if (!sets.length) return { error: 'nothing to update', code: 400 as const }
  sets.push('updated_at = ?')
  vals.push(Date.now())
  const before = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(id, userId).first<any>()
  if (!before) return { error: 'not found', code: 404 as const }
  await db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, id, userId).run()
  const xp = body.status !== undefined ? await applyTaskXp(db, userId, before, body.status as Status) : null
  // 進行中にしたら「最近の動き」とデイリーミッションに記録
  if (body.status === 'doing' && before.status !== 'doing') {
    await logActivity(db, userId, 'doing', before.title).run()
    await countDaily(db, userId, 'doings')
  }
  // 依頼されたタスクを完了したら依頼した人に知らせる
  if (body.status === 'done' && before.status !== 'done' && before.requested_by) {
    const follow = before.follow_id ? await db.prepare('SELECT title FROM tasks WHERE id = ?').bind(before.follow_id).first<{ title: string }>() : null
    const next = follow ? `。「${follow.title}」に進めます` : ''
    await notify(db, before.requested_by, userId, 'request_done', before.follow_id ?? id, `${san(user.name)}が依頼「${before.title}」を完了しました${next}`).run()
  }
  return { task: await getTask(db, id), xp }
}

/** 依頼されたタスクを削除したら依頼した人に知らせる */
async function deleteTasks(db: D1Database, user: User, ids: string[]) {
  const { results } = await db
    .prepare(`SELECT id, title, requested_by FROM tasks WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(user.id, ...ids)
    .all<any>()
  if (!results.length) return
  await db.batch([
    ...results.map((t) => db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').bind(t.id, user.id)),
    ...results
      .filter((t) => t.requested_by)
      .map((t) => notify(db, t.requested_by, user.id, 'request_deleted', null, `${san(user.name)}が依頼「${t.title}」を取り下げました`)),
  ])
}

api.patch('/tasks/:id', async (c) => {
  const body = await c.req.json<Patch>().catch(() => ({}))
  const r = await updateTask(c.env.DB, c.get('user'), c.req.param('id'), body)
  if ('error' in r) return c.json({ error: r.error }, r.code)
  return c.json(r)
})

const MOVE_LABEL = { doing: '進行中', done: '完了' } as const

/**
 * 他の人のタスクを 進行中 / 完了 に進める (戻すことはできない)。
 * XP などはタスクの持ち主に付き、持ち主には誰が動かしたかを通知する
 */
api.post('/tasks/:id/move', async (c) => {
  const { status } = await c.req.json<{ status?: unknown }>().catch(() => ({ status: undefined }))
  if (status !== 'doing' && status !== 'done') return c.json({ error: 'invalid status' }, 400)
  const me = c.get('user')
  const id = c.req.param('id')
  const db = c.env.DB
  const t = await db
    .prepare('SELECT t.title, t.status, t.user_id, u.name, u.display_name, u.email FROM tasks t JOIN users u ON u.id = t.user_id WHERE t.id = ?')
    .bind(id)
    .first<any>()
  if (!t || !isAllowed(c.env, t.email)) return c.json({ error: 'not found' }, 404)
  if (t.user_id === me.id) return c.json({ error: '自分のタスクは自分の画面で動かせます' }, 400)
  const order: Status[] = ['todo', 'doing', 'done']
  if (order.indexOf(status) <= order.indexOf(t.status)) return c.json({ error: `すでに${STATUS_LABEL_JA[t.status as Status]}です` }, 400)
  const owner: User = { id: t.user_id, email: t.email, name: displayName(t), picture: '' }
  const r = await updateTask(db, owner, id, { status, position: Date.now() })
  if ('error' in r) return c.json({ error: r.error }, r.code)
  await notify(db, owner.id, me.id, 'moved', id, `${san(me.name)}があなたのタスク「${t.title}」を${MOVE_LABEL[status]}にしました`).run()
  // 動かした人にも手伝い XP (完了なら持ち主が得た XP の半分)
  const xp = await awardHelp(db, me.id, id, status, helpXp(status, r.xp?.amount ?? 0))
  return c.json({ task: r.task, xp })
})

// ---------- 繰り返しタスク ----------
/** 繰り返しのルールで、今日の分のタスクがまだなら作る (開いたときに作るので、毎日開かなくても溜まらない) */
async function ensureRecurring(db: D1Database, userId: string) {
  const today = jstToday()
  const { results } = await db
    .prepare('SELECT * FROM recurring WHERE user_id = ? AND (last_day IS NULL OR last_day < ?)')
    .bind(userId, today)
    .all<any>()
  if (!results.length) return []
  const now = Date.now()
  const stmts: D1PreparedStatement[] = []
  const made: { id: string; title: string }[] = []
  for (const [i, r] of results.entries()) {
    stmts.push(db.prepare('UPDATE recurring SET last_day = ? WHERE id = ?').bind(today, r.id))
    if (!ruleMatches(r.rule, today)) continue
    const id = crypto.randomUUID()
    made.push({ id, title: r.title })
    stmts.push(
      db
        .prepare(
          `INSERT INTO tasks (id, user_id, title, note, status, position, created_at, updated_at, source, priority, recurring_id)
           VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, 'user', ?, ?)`,
        )
        .bind(id, userId, r.title, r.note, now - i, now, now, r.priority, r.id),
      logActivity(db, userId, 'todo', r.title),
    )
  }
  await db.batch(stmts)
  return made
}

api.get('/recurring', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, title, rule FROM recurring WHERE user_id = ? ORDER BY created_at').bind(c.get('user').id).all()
  return c.json({ recurring: results })
})

/** タスクを繰り返しにする (このタスクを今日の分として、次から自動で作る) */
api.post('/tasks/:id/recurring', async (c) => {
  const { rule } = await c.req.json<{ rule?: unknown }>().catch(() => ({ rule: null }))
  if (!isRule(rule)) return c.json({ error: 'invalid rule' }, 400)
  const userId = c.get('user').id
  const id = c.req.param('id')
  const t = await c.env.DB.prepare('SELECT title, note, priority, recurring_id FROM tasks WHERE id = ? AND user_id = ?').bind(id, userId).first<any>()
  if (!t) return c.json({ error: 'not found' }, 404)
  const db = c.env.DB
  if (t.recurring_id) {
    await db.prepare('UPDATE recurring SET rule = ? WHERE id = ? AND user_id = ?').bind(rule, t.recurring_id, userId).run()
  } else {
    const rid = crypto.randomUUID()
    await db.batch([
      db
        .prepare('INSERT INTO recurring (id, user_id, title, note, rule, priority, last_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(rid, userId, t.title, t.note, rule, t.priority, jstToday(), Date.now()),
      db.prepare('UPDATE tasks SET recurring_id = ? WHERE id = ?').bind(rid, id),
    ])
  }
  return c.json({ task: await getTask(db, id) })
})

/** 繰り返しをやめる (作られたタスクはそのまま残す) */
api.delete('/recurring/:id', async (c) => {
  const userId = c.get('user').id
  const rid = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').bind(rid, userId),
    c.env.DB.prepare('UPDATE tasks SET recurring_id = NULL WHERE recurring_id = ? AND user_id = ?').bind(rid, userId),
  ])
  return c.json({ ok: true })
})

// ---------- コメント ----------
/** タスクを見られる人 (ログインできる人) なら誰でも読める・書ける */
async function taskOwner(env: Env, id: string) {
  const t = await env.DB.prepare('SELECT t.id, t.title, t.user_id, t.requested_by, u.email FROM tasks t JOIN users u ON u.id = t.user_id WHERE t.id = ?').bind(id).first<any>()
  return t && isAllowed(env, t.email) ? t : null
}

api.get('/tasks/:id/comments', async (c) => {
  const t = await taskOwner(c.env, c.req.param('id'))
  if (!t) return c.json({ error: 'not found' }, 404)
  const me = c.get('user').id
  const { results } = await c.env.DB.prepare(
    `SELECT cm.*, ${nameOf('u')} AS u_name, u.picture AS u_picture, p.skin AS u_skin
       FROM comments cm JOIN users u ON u.id = cm.user_id LEFT JOIN players p ON p.user_id = cm.user_id
      WHERE cm.task_id = ? ORDER BY cm.created_at LIMIT 200`,
  )
    .bind(t.id)
    .all<any>()
  return c.json({
    comments: results.map((r) => ({
      id: r.id,
      user: { id: r.user_id, name: r.u_name, picture: r.u_picture, skin: r.u_skin },
      text: r.text,
      createdAt: r.created_at,
      mine: r.user_id === me,
    })),
  })
})

/** コメントを書く。持ち主・依頼した人・これまでにコメントした人に通知 (自分は除く) */
api.post('/tasks/:id/comments', async (c) => {
  const { text } = await c.req.json<{ text?: unknown }>().catch(() => ({ text: '' }))
  const body = typeof text === 'string' ? text.trim().slice(0, 1000) : ''
  if (!body) return c.json({ error: 'text required' }, 400)
  const t = await taskOwner(c.env, c.req.param('id'))
  if (!t) return c.json({ error: 'not found' }, 404)
  const me = c.get('user')
  const db = c.env.DB
  const { results } = await db.prepare('SELECT DISTINCT user_id FROM comments WHERE task_id = ?').bind(t.id).all<{ user_id: string }>()
  const to = new Set([t.user_id, t.requested_by, ...results.map((r) => r.user_id)].filter((u): u is string => !!u && u !== me.id))
  const short = body.length > 40 ? body.slice(0, 40) + '…' : body
  await db.batch([
    db.prepare('INSERT INTO comments (task_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').bind(t.id, me.id, body, Date.now()),
    ...[...to].map((u) => notify(db, u, me.id, 'comment', t.id, `${san(me.name)}が「${t.title}」にコメント: ${short}`)),
  ])
  return c.json({ ok: true }, 201)
})

/** 自分のコメントを消す */
api.delete('/comments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.get('user').id).run()
  return c.json({ ok: true })
})

/** 手動の並べ替え: ids の順 (上から) に位置を付け直す。自分のタスクだけ */
api.post('/tasks/reorder', async (c) => {
  const { ids } = await c.req.json<{ ids?: unknown }>().catch(() => ({ ids: [] }))
  const list = Array.isArray(ids) ? ids.filter(isId).slice(0, 300) : []
  if (!list.length) return c.json({ error: 'ids required' }, 400)
  const base = Date.now()
  const userId = c.get('user').id
  await c.env.DB.batch(list.map((id, i) => c.env.DB.prepare('UPDATE tasks SET position = ? WHERE id = ? AND user_id = ?').bind(base - i, id, userId)))
  return c.json({ ok: true })
})

/** 選択した複数タスクのステータス変更・削除 */
api.post('/tasks/bulk', async (c) => {
  const body = await c.req.json<{ ids?: unknown; status?: unknown; delete?: boolean }>().catch(() => ({}) as any)
  const ids = Array.isArray(body.ids) ? body.ids.filter(isId).slice(0, 100) : []
  if (!ids.length) return c.json({ error: 'ids required' }, 400)
  const user = c.get('user')
  if (body.delete) {
    await deleteTasks(c.env.DB, user, ids)
    return c.json({ ok: true })
  }
  if (!isStatus(body.status)) return c.json({ error: 'invalid status' }, 400)
  const tasks: Task[] = []
  const xp = { amount: 0, gold: 0, bonuses: [] as string[], level: 0, leveledUp: false }
  const now = Date.now()
  for (const [i, id] of ids.entries()) {
    const r = await updateTask(c.env.DB, user, id, { status: body.status, position: now - i })
    if ('error' in r || !r.task) continue
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
  await deleteTasks(c.env.DB, c.get('user'), [c.req.param('id')])
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

// ---------- 依頼 ----------
/** 他の人にタスクを依頼する (相手のリストに入る)。followId は自分側の後続タスク */
api.post('/requests', async (c) => {
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
api.get('/requests', async (c) => {
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
api.get('/attention', async (c) => {
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

api.get('/notifications', async (c) => {
  const me = c.get('user').id
  const [list, count] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT n.*, COALESCE(${nameOf('u')}, 'Flick') AS a_name, COALESCE(u.picture, '') AS a_picture, p.skin AS a_skin
         FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN players p ON p.user_id = n.actor_id
        WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 30`,
    ).bind(me),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(me),
  ])
  const notices: Notice[] = (list.results as any[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    taskId: r.task_id,
    actor: { id: r.actor_id, name: r.a_name, picture: r.a_picture, skin: r.a_skin },
    createdAt: r.created_at,
    read: !!r.read_at,
  }))
  return c.json({ notices, unread: (count.results[0] as any).n as number })
})

api.post('/notifications/read', async (c) => {
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
api.get('/reports', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, period_from, period_to, text, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .bind(c.get('user').id)
    .all<any>()
  return c.json({ reports: results.map((r) => ({ id: r.id, from: r.period_from, to: r.period_to, text: r.text, createdAt: r.created_at })) })
})

api.get('/history', async (c) => {
  const tasks = await history(c, c.req.query('from'), c.req.query('to'))
  return tasks ? c.json({ tasks }) : c.json({ error: 'invalid range' }, 400)
})

/** 期間の完了タスクから AI で日報・月次報告の下書きを作る */
api.post('/history/report', async (c) => {
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

// ---------- ゲーム ----------
const gameResponse = (c: any, r: { error?: string; player?: unknown }) =>
  r.error ? c.json({ error: r.error }, 400) : c.json({ player: r.player })

/** 自分の状態。新しく取れた実績があれば unlocked で返す (お祝い表示用) */
api.get('/player', async (c) => {
  const userId = c.get('user').id
  const { stats, fresh } = await syncAchievements(c.env.DB, userId)
  return c.json({ player: await getPlayer(c.env.DB, userId), stats, unlocked: fresh })
})

api.post('/player/title', async (c) => {
  const { title } = await c.req.json<{ title?: string | null }>().catch(() => ({ title: null }))
  return gameResponse(c, await setTitle(c.env.DB, c.get('user').id, typeof title === 'string' ? title : null))
})

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

api.post('/player/skin', async (c) => {
  const { skin } = await c.req.json<{ skin?: string | null }>().catch(() => ({ skin: null }))
  return gameResponse(c, await setSkin(c.env.DB, c.get('user').id, typeof skin === 'string' ? skin : null))
})

api.post('/battle', async (c) => c.json(await fight(c.env.DB, c.get('user').id)))

api.post('/player/pet', async (c) => {
  const { pet } = await c.req.json<{ pet?: string | null }>().catch(() => ({ pet: null }))
  return gameResponse(c, await setPet(c.env.DB, c.get('user').id, typeof pet === 'string' ? pet : null))
})

api.post('/items/:id/enhance', async (c) => gameResponse(c, await enhanceItem(c.env.DB, c.get('user').id, c.req.param('id'))))

api.post('/shop/:id', async (c) => {
  const r = await buyShop(c.env.DB, c.get('user').id, c.req.param('id') as ShopId)
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 今週のレイドボス */
api.get('/raid', async (c) => c.json(await raidState(c.env, c.get('user').id)))
api.post('/raid/claim', async (c) => {
  const r = await claimRaid(c.env, c.get('user').id)
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 先週の MVP */
api.get('/mvp', async (c) => c.json(await lastWeekMvp(c.env)))

/** 開催中の季節イベントと自分の進み具合 */
api.get('/event', async (c) => c.json({ event: await eventProgress(c.env.DB, c.get('user').id) }))

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

api.get('/people/:id', async (c) => {
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
const FEED_KINDS = ['todo', 'doing', 'done', 'flag', 'request']
const FEED_PAGE = 30

/** 最近の動き。?kind=all|todo|doing|done、?user= で人を絞り込み、?before= でさらに前を読む */
api.get('/activity', async (c) => {
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

// ---------- 管理者のみ ----------
const admin = new Hono<{ Bindings: Env; Variables: Vars }>()
admin.use('*', async (c, next) => {
  if (!c.get('user').isAdmin) return c.json({ error: 'forbidden' }, 403)
  await next()
})

/** 表示名を変更 (自分も含む。空にすると Google の名前に戻る) */
admin.patch('/people/:id/name', async (c) => {
  const id = c.req.param('id')
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

/** 最近の動きのログをまとめて削除 (?kind= でそのタブの分だけ。all ならタスクに関するログ全部) */
admin.delete('/activity', async (c) => {
  const kind = c.req.query('kind')
  const kinds = kind === 'todo' || kind === 'doing' || kind === 'done' ? [kind] : FEED_KINDS
  const r = await c.env.DB.prepare(`DELETE FROM activity WHERE kind IN (${kinds.map(() => '?').join(',')})`)
    .bind(...kinds)
    .run()
  return c.json({ ok: true, deleted: r.meta.changes ?? 0 })
})

api.route('/admin', admin)

app.route('/api', api)

app.notFound((c) => c.json({ error: 'not found' }, 404))

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
