/** メンバーと腕試し (練習試合) と、季節イベントの限定ボス */
import type { Env } from './env'
import { ensureDaily, getPlayer, insertItemFor, logActivity } from './game'
import { allowedUsers } from './lib'
import { EVENT_SKIN_MAP, EVENT_BOSS_TRIES, REMATCH_DAILY, SPAR_DAILY, activeEvent, eventBoss, eventBossGold, eventGearRarity, rematchGold } from '../shared/extras'
import { SKIN_MAP, duelRate, enemyForStage, invMax, jstDayStart, jstToday, levelInfo, rollItem, simulateBattle, simulateDuel, effectiveStats, SLOTS, type Item } from '../shared/game'

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]
const skinEmoji = (skin: string | null | undefined) => (skin ? (SKIN_MAP[skin] ?? EVENT_SKIN_MAP[skin])?.emoji : undefined) ?? '🧑'

// ---------- メンバーと腕試し ----------
/** 腕試しの相手 (自分以外のメンバー) と、相手ごとの通算成績・強さ・勝率の目安・今日の残り回数 */
export async function sparList(env: Env, me: string) {
  const db = env.DB
  const users = (await allowedUsers(env)).filter((u) => u.id !== me)
  const mine = await getPlayer(db, me)
  const opps = new Map(await Promise.all(users.map(async (u) => [u.id, await getPlayer(db, u.id)] as const)))
  const [players, record, today] = await db.batch([
    db.prepare('SELECT user_id, xp, stage, skin FROM players'),
    db.prepare('SELECT opponent_id, SUM(win) AS wins, SUM(1 - win) AS losses FROM spars WHERE user_id = ? GROUP BY opponent_id').bind(me),
    db.prepare('SELECT COUNT(*) AS n FROM spars WHERE user_id = ? AND created_at >= ?').bind(me, jstDayStart(Date.now())),
  ])
  const pl = new Map((players.results as any[]).map((p) => [p.user_id, p]))
  const rec = new Map((record.results as any[]).map((r) => [r.opponent_id, r]))
  return {
    left: Math.max(0, SPAR_DAILY - ((today.results[0] as any)?.n ?? 0)),
    people: users.map((u) => {
      const p = pl.get(u.id)
      return {
        id: u.id,
        name: u.name,
        picture: u.picture,
        skin: p?.skin ?? null,
        level: levelInfo(p?.xp ?? 0).level,
        stage: p?.stage ?? 1,
        wins: rec.get(u.id)?.wins ?? 0,
        losses: rec.get(u.id)?.losses ?? 0,
        job: opps.get(u.id)!.job.name,
        jobIcon: opps.get(u.id)!.job.icon,
        power: effectiveStats(opps.get(u.id)!),
        rate: duelRate(mine, opps.get(u.id)!),
      }
    }),
  }
}

/** 腕試し: 相手のキャラと 1 対 1 (お互いにスキル・装備の効果を使う)。勝っても負けても XP・ゴールド・装備は変わらない */
export async function spar(env: Env, me: string, opponentId: string) {
  if (opponentId === me) return { error: '自分とは戦えません' }
  const opp = (await allowedUsers(env)).find((u) => u.id === opponentId)
  if (!opp) return { error: 'メンバーが見つかりません' }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM spars WHERE user_id = ? AND created_at >= ?').bind(me, jstDayStart(Date.now())).first<{ n: number }>()
  if ((n?.n ?? 0) >= SPAR_DAILY) return { error: `腕試しは1日${SPAR_DAILY}回までです` }
  const [p, o] = await Promise.all([getPlayer(env.DB, me), getPlayer(env.DB, opponentId)])
  const result = simulateDuel(p, o, { name: opp.name, icon: skinEmoji(o.skin) }, seed())
  await env.DB.prepare('INSERT INTO spars (user_id, opponent_id, win, created_at) VALUES (?, ?, ?, ?)').bind(me, opponentId, result.win ? 1 : 0, Date.now()).run()
  const s = effectiveStats(o)
  return { result, opponent: { id: opp.id, name: opp.name, job: o.job.name, jobIcon: o.job.icon, stats: s } }
}

// ---------- 季節イベントの限定ボス ----------
/** 開催中なら、限定ボスと今日の挑戦回数・持っている限定装備 */
export async function eventBossState(env: Env, me: string) {
  const ev = activeEvent(jstToday())
  if (!ev) return { event: null }
  const p = await getPlayer(env.DB, me)
  const row = await env.DB.prepare('SELECT tries, wins FROM event_battles WHERE user_id = ? AND day = ?').bind(me, jstToday()).first<{ tries: number; wins: number }>()
  const names = Object.values(ev.gear)
  return {
    event: { id: ev.id, name: ev.name, icon: ev.icon, end: ev.end },
    boss: eventBoss(ev, p.stage),
    gear: SLOTS.map((s) => ({ slot: s.key, name: ev.gear[s.key], owned: p.items.some((i) => i.name === ev.gear[s.key]) })),
    owned: p.items.filter((i) => names.includes(i.name)).length,
    tries: row?.tries ?? 0,
    won: (row?.wins ?? 0) > 0,
    left: (row?.wins ?? 0) > 0 ? 0 : Math.max(0, EVENT_BOSS_TRIES - (row?.tries ?? 0)),
  }
}

/** 限定ボスに挑む。勝つとゴールドと限定装備 (SR 以上、まだ持っていない部位を優先) */
export async function fightEventBoss(env: Env, me: string) {
  const db = env.DB
  const ev = activeEvent(jstToday())
  if (!ev) return { error: '開催中のイベントはありません' }
  const day = jstToday()
  const p = await getPlayer(db, me)
  // 挑戦回数を先に数える (同時に押しても回数を超えない)
  await db.prepare('INSERT OR IGNORE INTO event_battles (user_id, day, event) VALUES (?, ?, ?)').bind(me, day, ev.id).run()
  const take = await db
    .prepare('UPDATE event_battles SET tries = tries + 1 WHERE user_id = ? AND day = ? AND wins = 0 AND tries < ?')
    .bind(me, day, EVENT_BOSS_TRIES)
    .run()
  if (!take.meta.changes) return { error: '今日の挑戦は終わりました。また明日' }
  const enemy = eventBoss(ev, p.stage)
  const result = simulateBattle(p, enemy, seed())
  let reward: { gold: number; item: Item | null } | null = null
  if (result.win) {
    const gold = eventBossGold(enemy.stage)
    const stmts: D1PreparedStatement[] = [
      db.prepare('UPDATE event_battles SET wins = wins + 1 WHERE user_id = ? AND day = ?').bind(me, day),
      db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(gold, Date.now(), me),
      logActivity(db, me, 'boss', `${ev.icon}${ev.boss.icon} ${ev.boss.name}を撃破`),
    ]
    let item: Item | null = null
    if (p.items.length < invMax(p)) {
      const missing = SLOTS.filter((s) => !p.items.some((i) => i.name === ev.gear[s.key]))
      const pool = missing.length ? missing : SLOTS
      const slot = pool[seed() % pool.length].key
      const rolled = rollItem(seed(), p.stage, eventGearRarity(seed() / 2 ** 32), slot)
      const ins = insertItemFor(db, me, { ...rolled, name: ev.gear[slot] })
      item = ins.item
      stmts.push(ins.stmt, logActivity(db, me, 'item', `${item.rarity} ${item.name}`))
    }
    await db.batch(stmts)
    reward = { gold, item }
  }
  return { result, reward, player: await getPlayer(db, me) }
}

// ---------- 過去のボスと再戦 ----------
/** 今日の再戦の残り回数 */
export async function rematchState(env: Env, me: string) {
  const r = await env.DB.prepare('SELECT rematches FROM daily WHERE user_id = ? AND day = ?').bind(me, jstDayStart(Date.now())).first<{ rematches: number }>()
  return { left: Math.max(0, REMATCH_DAILY - (r?.rematches ?? 0)), daily: REMATCH_DAILY }
}

/** 倒したことのあるステージのボスともう一度戦う。勝つと少しゴールド (ステージは進まない・装備は出ない) */
export async function rematch(env: Env, me: string, stage: number) {
  const db = env.DB
  const p = await getPlayer(db, me)
  if (!Number.isInteger(stage) || stage < 1 || stage >= p.stage) return { error: 'まだ倒していないボスです' }
  const day = jstDayStart(Date.now())
  await ensureDaily(db, me, day)
  // 回数を先に数える (同時に押しても上限を超えない)。ミッションの「バトル」にも数える
  const take = await db
    .prepare('UPDATE daily SET rematches = rematches + 1, battles = battles + 1 WHERE user_id = ? AND day = ? AND rematches < ?')
    .bind(me, day, REMATCH_DAILY)
    .run()
  if (!take.meta.changes) return { error: `再戦は1日${REMATCH_DAILY}回までです。また明日` }
  const enemy = enemyForStage(stage)
  const result = simulateBattle(p, enemy, seed())
  let reward: { gold: number; item: Item | null } | null = null
  if (result.win) {
    const gold = rematchGold(stage)
    await db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(gold, Date.now(), me).run()
    reward = { gold, item: null }
  }
  return { result, reward, player: await getPlayer(db, me), ...(await rematchState(env, me)) }
}
