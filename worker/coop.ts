/** 図鑑のご褒美と、週替わりの協力クエスト */
import { displayName, isAllowed, type Env } from './env'
import { getPlayer, insertItemFor } from './game'
import { invMax, jstDayStart, jstToday, levelInfo, rollItem } from '../shared/game'
import { COOP_GOLD, coopForWeek, mondayOf, shiftDay, srChestRarity, type CoopKind } from '../shared/extras'
import { CODEX_REWARDS, codexClaimable, codexOf } from '../shared/collection'

const DAY = 86400000
const JST = 9 * 3600000
const startOf = (day: string) => jstDayStart(Date.parse(`${day}T00:00:00+09:00`))

// ---------- 図鑑 ----------
/** 一度でも手に入れた装備の名前 */
export async function codexNames(db: D1Database, userId: string) {
  const { results } = await db.prepare('SELECT name FROM codex WHERE user_id = ?').bind(userId).all<{ name: string }>()
  return results.map((r) => r.name)
}

export async function codexState(db: D1Database, userId: string) {
  const [names, p] = await Promise.all([codexNames(db, userId), getPlayer(db, userId)])
  return { names, claimed: p.codexClaimed ?? 0 }
}

/** うめた割合に届いたご褒美をまとめて受け取る */
export async function claimCodex(db: D1Database, userId: string) {
  const [names, p] = await Promise.all([codexNames(db, userId), getPlayer(db, userId)])
  const c = codexOf({ names, stage: p.stage, level: levelInfo(p.xp).level, ownedSkins: p.ownedSkins ?? [], achieved: (p.achievements ?? []).map((a) => a.id) })
  const claimed = p.codexClaimed ?? 0
  const take = codexClaimable(c.pct, claimed)
  if (!take.length) return { error: `次のご褒美は図鑑${CODEX_REWARDS[claimed]?.pct ?? 100}%です` }
  const gold = take.reduce((a, r) => a + r.gold, 0)
  // 受け取った数が変わっていないときだけ (同時に押しても二重に受け取らない)
  const r = await db
    .prepare('UPDATE players SET gold = gold + ?, codex_claimed = ?, updated_at = ? WHERE user_id = ? AND codex_claimed = ?')
    .bind(gold, claimed + take.length, Date.now(), userId, claimed)
    .run()
  if (!r.meta.changes) return { error: 'もう一度お試しください' }
  return { gold, count: take.length, player: await getPlayer(db, userId), names }
}

// ---------- 協力クエスト ----------
/** その週 (from 〜 to) の、人ごとの進み具合 */
async function coopCounts(db: D1Database, kind: CoopKind, from: number, to: number) {
  if (kind === 'help') {
    const { results } = await db
      .prepare('SELECT user_id, COUNT(*) AS n FROM helps WHERE created_at >= ? AND created_at < ? GROUP BY user_id')
      .bind(from, to)
      .all<{ user_id: string; n: number }>()
    return results
  }
  const cond: Record<Exclude<CoopKind, 'help'>, string> = {
    done: '1',
    big: "COALESCE(weight_user, weight) IN ('L', 'XL')",
    ontime: "due_date IS NOT NULL AND due_date >= date((done_at + 32400000) / 1000, 'unixepoch')",
    request: 'requested_by IS NOT NULL AND requested_by <> user_id',
    early: `((done_at + ${JST}) % ${DAY}) < ${10 * 3600000}`,
  }
  const { results } = await db
    .prepare(`SELECT user_id, SUM(${cond[kind]}) AS n FROM tasks WHERE xp_awarded > 0 AND done_at >= ? AND done_at < ? GROUP BY user_id`)
    .bind(from, to)
    .all<{ user_id: string; n: number }>()
  return results
}

export async function coopState(env: Env, me: string) {
  const monday = mondayOf(jstToday())
  const from = startOf(monday)
  const { results: users } = await env.DB.prepare(
    'SELECT u.id, u.name, u.display_name, u.email, u.picture, p.skin FROM users u LEFT JOIN players p ON p.user_id = u.id',
  ).all<any>()
  const members = users.filter((u) => isAllowed(env, u.email))
  const quest = coopForWeek(monday, members.length)
  const counts = new Map((await coopCounts(env.DB, quest.id, from, from + 7 * DAY)).map((r) => [r.user_id, r.n ?? 0]))
  const ranking = members
    .map((u) => ({ id: u.id as string, name: displayName(u), picture: u.picture as string, skin: (u.skin as string) ?? null, value: counts.get(u.id) ?? 0 }))
    .sort((a, b) => b.value - a.value)
  const value = ranking.reduce((a, p) => a + p.value, 0)
  const claimed = !!(await env.DB.prepare('SELECT 1 FROM coop_claims WHERE user_id = ? AND week = ?').bind(me, monday).first())
  return { week: monday, until: shiftDay(monday, 6), quest, value, done: value >= quest.goal, ranking, mine: counts.get(me) ?? 0, claimed, gold: COOP_GOLD }
}

/** 達成した週の報酬 (メンバー全員、1 週 1 回): ゴールド + SR 以上の装備 */
export async function claimCoop(env: Env, me: string) {
  const s = await coopState(env, me)
  if (!s.done) return { error: 'まだ達成していません' }
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO coop_claims (user_id, week, created_at) VALUES (?, ?, ?)').bind(me, s.week, Date.now()).run()
  if (!ins.meta.changes) return { error: '受け取り済みです' }
  const p = await getPlayer(env.DB, me)
  const stmts: D1PreparedStatement[] = [env.DB.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(COOP_GOLD, Date.now(), me)]
  let item = null
  if (p.items.length < invMax(p)) {
    const r = crypto.getRandomValues(new Uint32Array(2))
    const x = insertItemFor(env.DB, me, rollItem(r[0], p.stage, srChestRarity(r[1] / 2 ** 32)))
    item = x.item
    stmts.push(x.stmt)
  }
  await env.DB.batch(stmts)
  return { gold: COOP_GOLD, item, player: await getPlayer(env.DB, me) }
}
