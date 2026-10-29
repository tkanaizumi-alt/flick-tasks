/** タスク (追加・更新・分解・期限・フラグ・繰り返し・コメント・並べ替え・AI) */
import { displayName, isAllowed, type Env } from '../env'
import { aiTasks } from '../ai'
import { applyTaskXp, awardHelp, classifyWeights, doneCutoff, countDaily, logActivity, notify } from '../game'
import { FLAGS, REACTION_MAP, isReaction, mentionsIn, type Flag, type Status, type Task, type User, san } from '../../shared/types'
import { isRule, ruleMatches } from '../../shared/recurring'
import { BREAKDOWN_MAX, helpXp, jstToday, weightChoices, type Weight } from '../../shared/game'
import { router, toTask, nameOf, TASK_SELECT, isDate, cleanTitle, cleanNote, isStatus, STATUS_LABEL_JA, isFlag, isId, getTask, allowedUsers, allowedUser, VISIBLE } from '../lib'

export const tasks = router()

tasks.get('/me', (c) => c.json({ user: c.get('user') }))

tasks.get('/tasks', async (c) => {
  // 繰り返しタスクの今日の分を (まだなら) 作ってから返す。作業量の判定は裏で
  const made = await ensureRecurring(c.env.DB, c.get('user').id)
  if (made.length) c.executionCtx.waitUntil(classifyWeights(c.env, made))
  const { results } = await c.env.DB.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND ${VISIBLE} ORDER BY t.position DESC`)
    .bind(c.get('user').id, doneCutoff())
    .all()
  return c.json({ tasks: results.map(toTask) })
})

/** 期限の設定。自分のタスクにも他の人のタスクにも設定できる (空で解除) */
tasks.put('/tasks/:id/due', async (c) => {
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
tasks.put('/tasks/:id/flag', async (c) => {
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
tasks.put('/tasks/:id/weight', async (c) => {
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

tasks.post('/tasks', async (c) => {
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
tasks.post('/tasks/:id/breakdown', async (c) => {
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

tasks.patch('/tasks/:id', async (c) => {
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
tasks.post('/tasks/:id/move', async (c) => {
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

tasks.get('/recurring', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, title, rule FROM recurring WHERE user_id = ? ORDER BY created_at').bind(c.get('user').id).all()
  return c.json({ recurring: results })
})

/** タスクを繰り返しにする (このタスクを今日の分として、次から自動で作る) */
tasks.post('/tasks/:id/recurring', async (c) => {
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
tasks.delete('/recurring/:id', async (c) => {
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

tasks.get('/tasks/:id/comments', async (c) => {
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
tasks.post('/tasks/:id/comments', async (c) => {
  const { text } = await c.req.json<{ text?: unknown }>().catch(() => ({ text: '' }))
  const body = typeof text === 'string' ? text.trim().slice(0, 1000) : ''
  if (!body) return c.json({ error: 'text required' }, 400)
  const t = await taskOwner(c.env, c.req.param('id'))
  if (!t) return c.json({ error: 'not found' }, 404)
  const me = c.get('user')
  const db = c.env.DB
  const short = body.length > 40 ? body.slice(0, 40) + '…' : body
  // 「@名前」があれば、その人 (とタスクの持ち主) にだけ知らせる。なければ持ち主・依頼した人・これまでコメントした人
  const mentioned = mentionsIn(body, await allowedUsers(c.env)).filter((u) => u !== me.id)
  let to: Set<string>
  if (mentioned.length) {
    to = new Set([...mentioned, t.user_id].filter((u) => u !== me.id))
  } else {
    const { results } = await db.prepare('SELECT DISTINCT user_id FROM comments WHERE task_id = ?').bind(t.id).all<{ user_id: string }>()
    to = new Set([t.user_id, t.requested_by, ...results.map((r) => r.user_id)].filter((u): u is string => !!u && u !== me.id))
  }
  await db.batch([
    db.prepare('INSERT INTO comments (task_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').bind(t.id, me.id, body, Date.now()),
    ...[...to].map((u) =>
      notify(db, u, me.id, 'comment', t.id, mentioned.includes(u) ? `${san(me.name)}があなた宛てにコメント (「${t.title}」): ${short}` : `${san(me.name)}が「${t.title}」にコメント: ${short}`),
    ),
  ])
  return c.json({ ok: true }, 201)
})

/** リアクション: 他の人のタスクに付ける (もう一度で取り消し)。付けたときは持ち主に知らせる */
tasks.post('/tasks/:id/reactions', async (c) => {
  const { kind } = await c.req.json<{ kind?: unknown }>().catch(() => ({ kind: null }))
  if (!isReaction(kind)) return c.json({ error: 'invalid kind' }, 400)
  const t = await taskOwner(c.env, c.req.param('id'))
  if (!t) return c.json({ error: 'not found' }, 404)
  const me = c.get('user')
  if (t.user_id === me.id) return c.json({ error: '自分のタスクにはリアクションできません' }, 400)
  const db = c.env.DB
  const ins = await db.prepare('INSERT OR IGNORE INTO reactions (task_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)').bind(t.id, me.id, kind, Date.now()).run()
  if (ins.meta.changes) {
    await notify(db, t.user_id, me.id, 'reaction', t.id, `${san(me.name)}が「${t.title}」に ${REACTION_MAP[kind].emoji} ${REACTION_MAP[kind].label}`).run()
  } else {
    await db.prepare('DELETE FROM reactions WHERE task_id = ? AND user_id = ? AND kind = ?').bind(t.id, me.id, kind).run()
  }
  return c.json({ task: await getTask(db, t.id), on: !!ins.meta.changes })
})

/** 自分のコメントを消す */
tasks.delete('/comments/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), c.get('user').id).run()
  return c.json({ ok: true })
})

/** 手動の並べ替え: ids の順 (上から) に位置を付け直す。自分のタスクだけ */
tasks.post('/tasks/reorder', async (c) => {
  const { ids } = await c.req.json<{ ids?: unknown }>().catch(() => ({ ids: [] }))
  const list = Array.isArray(ids) ? ids.filter(isId).slice(0, 300) : []
  if (!list.length) return c.json({ error: 'ids required' }, 400)
  const base = Date.now()
  const userId = c.get('user').id
  await c.env.DB.batch(list.map((id, i) => c.env.DB.prepare('UPDATE tasks SET position = ? WHERE id = ? AND user_id = ?').bind(base - i, id, userId)))
  return c.json({ ok: true })
})

/** 選択した複数タスクのステータス変更・削除 */
tasks.post('/tasks/bulk', async (c) => {
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

tasks.delete('/tasks/:id', async (c) => {
  await deleteTasks(c.env.DB, c.get('user'), [c.req.param('id')])
  return c.json({ ok: true })
})

tasks.post('/ai/:kind', async (c) => {
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
