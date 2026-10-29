import { Hono } from 'hono'
import { displayName, isAllowed, type Env, type Vars } from './env'
import { FLAGS, STATUSES, type Flag, type Status, type Task, isReaction, type ReactionKind } from '../shared/types'

/** ルートで使う Hono の型 (ログイン済みのユーザーが c.get('user') に入る) */
export type Api = Hono<{ Bindings: Env; Variables: Vars }>
export const router = (): Api => new Hono<{ Bindings: Env; Variables: Vars }>()

/** 完了から 7 日経ったタスクはボードに返さない (履歴には残る) */
export const VISIBLE = "NOT (t.status = 'done' AND COALESCE(t.done_at, t.updated_at) < ?)"

export const ref = (id: unknown, name: unknown) => (id ? { id: id as string, name: (name as string) ?? '' } : null)

/** リアクションの JSON (SQL の json_group_array) をタスクの形に */
const parseReactions = (v: unknown): Task['reactions'] => {
  try {
    return (JSON.parse(String(v ?? '[]')) as { k: string; u: string; n: string }[]).filter((x) => isReaction(x.k)).map((x) => ({ kind: x.k as ReactionKind, user: { id: x.u, name: x.n ?? '' } }))
  } catch {
    return []
  }
}

export const toTask = (r: any): Task => ({
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
  reactions: parseReactions(r.reactions_json),
  waitingOn: r.wait_id ? { id: r.wait_id, title: r.wait_title, status: r.wait_status, owner: { id: r.wait_owner, name: r.wait_owner_name ?? '' } } : null,
})

/** 表示名 (管理者が付けた名前 → Google の名前 → メールの @ より前) を SQL で */
export const nameOf = (a: string) => `COALESCE(${a}.display_name, ${a}.name, substr(${a}.email, 1, instr(${a}.email, '@') - 1))`

/** タスク + 期限を設定した人・分解元・子タスクの進み具合・フラグ・依頼の情報 */
export const TASK_SELECT = `SELECT t.*, ${nameOf('du')} AS due_by_name,
    pt.title AS parent_title, COALESCE(pt.weight_user, pt.weight) AS parent_weight,
    CASE WHEN t.parent_id IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.parent_id) END AS sibling_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS child_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.status = 'done') AS child_done,
    ${nameOf('fu')} AS flag_to_name, ${nameOf('ru')} AS requested_by_name, ft.title AS follow_title,
    rc.rule AS recurring_rule, (SELECT COUNT(*) FROM comments cm WHERE cm.task_id = t.id) AS comment_count,
    (SELECT json_group_array(json_object('k', rx.kind, 'u', rx.user_id, 'n', ${nameOf('rxu')})) FROM reactions rx JOIN users rxu ON rxu.id = rx.user_id WHERE rx.task_id = t.id) AS reactions_json,
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
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

export const cleanTitle = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 500) : '')
export const cleanNote = (v: unknown) => (typeof v === 'string' ? v.slice(0, 5000) : '')
export const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status)
export const STATUS_LABEL_JA: Record<Status, string> = { todo: '未着手', doing: '進行中', done: '完了' }
export const isFlag = (v: unknown): v is Flag => typeof v === 'string' && v in FLAGS
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,64}$/.test(v)

export const getTask = async (db: D1Database, id: string) => {
  const row = await db.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first()
  return row ? toTask(row) : null
}

/** ログインできる (ALLOWED_EMAILS に入っている) ユーザー */
export async function allowedUsers(env: Env) {
  const { results } = await env.DB.prepare('SELECT id, name, display_name, email, picture FROM users').all<any>()
  return results.filter((u) => isAllowed(env, u.email)).map((u) => ({ id: u.id as string, name: displayName(u), picture: u.picture as string }))
}

export async function allowedUser(env: Env, id: unknown) {
  if (!isId(id)) return null
  const u = await env.DB.prepare('SELECT id, name, display_name, email FROM users WHERE id = ?').bind(id).first<any>()
  return u && isAllowed(env, u.email) ? { id: u.id as string, name: displayName(u) } : null
}

