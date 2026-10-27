import { ACHIEVEMENTS, achieved, bestStreakOf, streakOf, type AchievementDef, type AchievementStats } from '../shared/achievements'
import { jstDayStart, jstToday, levelInfo } from '../shared/game'
import { EVENT_GOAL, activeEvent } from '../shared/extras'

const DAY = 86400000
const JST = 9 * 3600000
/** JST の通し日番号 (完了した日の比較用) */
export const jstDayNo = (t: number) => Math.floor((t + JST) / DAY)

/** 完了した日 (JST の通し日番号) の一覧 */
export async function doneDays(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(`SELECT DISTINCT CAST((done_at + ${JST}) / ${DAY} AS INTEGER) AS d FROM tasks WHERE user_id = ? AND xp_awarded > 0 AND done_at IS NOT NULL`)
    .bind(userId)
    .all<{ d: number }>()
  return results.map((r) => r.d)
}

/** 全員分の 今の連続日数 (みんなの画面用) */
export async function streaks(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT user_id, CAST((done_at + ${JST}) / ${DAY} AS INTEGER) AS d FROM tasks
        WHERE xp_awarded > 0 AND done_at >= ? GROUP BY user_id, d`,
    )
    .bind(Date.now() - 400 * DAY)
    .all<{ user_id: string; d: number }>()
  const byUser = new Map<string, number[]>()
  for (const r of results) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.d])
  const today = jstDayNo(Date.now())
  return new Map([...byUser].map(([u, days]) => [u, streakOf(days, today)]))
}

export async function achievementStats(db: D1Database, userId: string): Promise<AchievementStats> {
  const [agg, helps, player, ssr] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS done,
                SUM(COALESCE(weight_user, weight) IN ('L', 'XL')) AS big,
                SUM(COALESCE(weight_user, weight) = 'XL') AS xl,
                SUM(requested_by IS NOT NULL) AS requests,
                SUM(parent_id IS NOT NULL) AS split,
                SUM(((done_at + ${JST}) % ${DAY}) < ${10 * 3600000}) AS early
           FROM tasks WHERE user_id = ? AND status = 'done' AND xp_awarded > 0`,
      )
      .bind(userId),
    db.prepare('SELECT COUNT(*) AS n FROM helps WHERE user_id = ?').bind(userId),
    db.prepare('SELECT xp, stage FROM players WHERE user_id = ?').bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM items WHERE user_id = ? AND rarity = 'SSR'").bind(userId),
  ])
  const a = agg.results[0] as any
  const p = (player.results[0] as any) ?? { xp: 0, stage: 1 }
  const days = await doneDays(db, userId)
  return {
    done: a.done ?? 0,
    streak: streakOf(days, jstDayNo(Date.now())),
    bestStreak: bestStreakOf(days),
    big: a.big ?? 0,
    xl: a.xl ?? 0,
    helps: (helps.results[0] as any).n ?? 0,
    requests: a.requests ?? 0,
    split: a.split ?? 0,
    early: a.early ?? 0,
    cleared: Math.max(0, (p.stage ?? 1) - 1),
    level: levelInfo(p.xp ?? 0).level,
    ssr: (ssr.results[0] as any).n ?? 0,
  }
}

/** 条件を満たした実績を記録し、今回新しく取れたものを返す */
export async function syncAchievements(db: D1Database, userId: string): Promise<{ stats: AchievementStats; fresh: AchievementDef[] }> {
  const stats = await achievementStats(db, userId)
  const { results } = await db.prepare('SELECT achievement_id FROM player_achievements WHERE user_id = ?').bind(userId).all<{ achievement_id: string }>()
  const have = new Set(results.map((r) => r.achievement_id))
  const fresh = ACHIEVEMENTS.filter((a) => !have.has(a.id) && achieved(a, stats))
  // 開催中の季節イベント: 期間中に規定数を完了したら限定スキン (実績と同じ表に記録)
  const ev = await eventProgress(db, userId)
  if (ev && !have.has(ev.key) && ev.done >= EVENT_GOAL) {
    fresh.push({ id: ev.key, name: `${ev.name}の限定スキン「${ev.skin.name}」`, icon: ev.skin.emoji, desc: `${ev.name}で${EVENT_GOAL}件完了`, stat: 'done', goal: 0 })
  }
  if (fresh.length) {
    const now = Date.now()
    await db.batch(
      fresh.map((a) => db.prepare('INSERT OR IGNORE INTO player_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').bind(userId, a.id, now)),
    )
  }
  return { stats, fresh }
}


/** 開催中の季節イベントと、期間中に完了した数 */
export async function eventProgress(db: D1Database, userId: string) {
  const ev = activeEvent(jstToday())
  if (!ev) return null
  const start = jstDayStart(Date.parse(`${ev.start}T00:00:00+09:00`))
  const end = jstDayStart(Date.parse(`${ev.end}T00:00:00+09:00`)) + DAY
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND xp_awarded > 0 AND done_at >= ? AND done_at < ?")
    .bind(userId, start, end)
    .first<{ n: number }>()
  const got = await db.prepare('SELECT 1 FROM player_achievements WHERE user_id = ? AND achievement_id = ?').bind(userId, ev.key).first()
  return { ...ev, done: r?.n ?? 0, got: !!got }
}
