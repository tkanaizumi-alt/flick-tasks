import { displayName, isAllowed, type Env } from './env'
import { getPlayer, insertItemFor } from './game'
import { INVENTORY_MAX, jstDayStart, jstToday, rollItem } from '../shared/game'
import { RAID_GOLD, mondayOf, raidForWeek, shiftDay } from '../shared/extras'

const DAY = 86400000
const startOf = (day: string) => jstDayStart(Date.parse(`${day}T00:00:00+09:00`))

/** ログインできる人と、その週 (from 〜 to の前日) に各自が得た XP (タスクの XP + 手伝い XP) */
async function weekXp(env: Env, from: number, to: number) {
  const [users, tasks, helps, players] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, display_name, email, picture FROM users'),
    env.DB.prepare('SELECT user_id, SUM(xp_awarded) AS xp, COUNT(*) AS n FROM tasks WHERE xp_awarded > 0 AND done_at >= ? AND done_at < ? GROUP BY user_id').bind(from, to),
    env.DB.prepare('SELECT user_id, SUM(xp) AS xp, COUNT(*) AS n FROM helps WHERE created_at >= ? AND created_at < ? GROUP BY user_id').bind(from, to),
    env.DB.prepare('SELECT user_id, skin FROM players'),
  ])
  const t = new Map((tasks.results as any[]).map((r) => [r.user_id, r]))
  const h = new Map((helps.results as any[]).map((r) => [r.user_id, r]))
  const skin = new Map((players.results as any[]).map((r) => [r.user_id, r.skin]))
  return (users.results as any[])
    .filter((u) => isAllowed(env, u.email))
    .map((u) => ({
      id: u.id as string,
      name: displayName(u),
      picture: u.picture as string,
      skin: (skin.get(u.id) as string) ?? null,
      taskXp: t.get(u.id)?.xp ?? 0,
      done: t.get(u.id)?.n ?? 0,
      helpXp: h.get(u.id)?.xp ?? 0,
      helps: h.get(u.id)?.n ?? 0,
    }))
}

/** 今週のレイドボス: 全員の今週の XP がそのままダメージになる */
export async function raidState(env: Env, me: string) {
  const monday = mondayOf(jstToday())
  const from = startOf(monday)
  const people = await weekXp(env, from, from + 7 * DAY)
  const boss = raidForWeek(monday, people.length)
  const ranking = people.map((p) => ({ id: p.id, name: p.name, picture: p.picture, skin: p.skin, damage: p.taskXp + p.helpXp })).sort((a, b) => b.damage - a.damage)
  const damage = ranking.reduce((a, p) => a + p.damage, 0)
  const claimed = !!(await env.DB.prepare('SELECT 1 FROM raid_claims WHERE user_id = ? AND week = ?').bind(me, monday).first())
  const mine = ranking.find((p) => p.id === me)?.damage ?? 0
  return { week: monday, until: shiftDay(monday, 6), boss, damage, defeated: damage >= boss.hp, ranking, mine, claimed }
}

/** 倒した週の報酬 (ダメージを与えた人だけ、1 週 1 回): ゴールド + R 以上の装備 */
export async function claimRaid(env: Env, me: string) {
  const s = await raidState(env, me)
  if (!s.defeated) return { error: 'まだ倒していません' }
  if (s.mine <= 0) return { error: '今週はまだダメージを与えていません' }
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO raid_claims (user_id, week, created_at) VALUES (?, ?, ?)').bind(me, s.week, Date.now()).run()
  if (!ins.meta.changes) return { error: '受け取り済みです' }
  const p = await getPlayer(env.DB, me)
  const stmts: D1PreparedStatement[] = [env.DB.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(RAID_GOLD, Date.now(), me)]
  let item = null
  if (p.items.length < INVENTORY_MAX) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const rolled = rollItem(seed, p.stage)
    const x = insertItemFor(env.DB, me, rolled.rarity === 'N' ? rollItem(seed + 1, p.stage, 'R') : rolled)
    item = x.item
    stmts.push(x.stmt)
  }
  await env.DB.batch(stmts)
  return { gold: RAID_GOLD, item, player: await getPlayer(env.DB, me) }
}

/** 先週の MVP: いちばん完了した人・いちばん XP を得た人・いちばん手伝った人 */
export async function lastWeekMvp(env: Env) {
  const monday = shiftDay(mondayOf(jstToday()), -7)
  const from = startOf(monday)
  const people = await weekXp(env, from, from + 7 * DAY)
  const top = (key: 'done' | 'xp' | 'helps') => {
    const v = (p: (typeof people)[number]) => (key === 'xp' ? p.taskXp + p.helpXp : p[key])
    const best = Math.max(0, ...people.map(v))
    return best > 0 ? { value: best, winners: people.filter((p) => v(p) === best).map((p) => ({ id: p.id, name: p.name, picture: p.picture, skin: p.skin })) } : null
  }
  return { week: monday, until: shiftDay(monday, 6), done: top('done'), xp: top('xp'), helps: top('helps') }
}
