import type { Env } from './env'
import {
  CHEST_COST,
  DONE_KEEP_DAYS,
  INVENTORY_MAX,
  RARITY_SELL,
  SLOTS,
  bossGold,
  canLearn,
  computeXp,
  dailyMissions,
  enemyForStage,
  equippedItems,
  jstDayStart,
  levelInfo,
  missionProgress,
  rollItem,
  simulateBattle,
  spInfo,
  STATS,
  type DailyCounts,
  type Item,
  type PlayerState,
  type Rarity,
  type Slot,
  type StatKey,
  type Weight,
} from '../shared/game'

const STAT_COL: Record<StatKey, string> = { atk: 'stat_atk', hp: 'stat_hp', crit: 'stat_crit', heal: 'stat_heal' }
const SLOT_COL: Record<Slot, string> = { weapon: 'eq_weapon', armor: 'eq_armor', charm: 'eq_charm' }

const toItem = (r: any): Item => ({
  id: r.id,
  slot: r.slot,
  name: r.name,
  icon: r.icon,
  rarity: r.rarity,
  atk: r.atk,
  hp: r.hp,
  crit: r.crit,
  heal: r.heal,
  effect: r.effect ?? null,
})

export async function getPlayer(db: D1Database, userId: string): Promise<PlayerState> {
  await db.prepare('INSERT OR IGNORE INTO players (user_id, updated_at) VALUES (?, ?)').bind(userId, Date.now()).run()
  const [row, skills, items] = await db.batch([
    db.prepare('SELECT * FROM players WHERE user_id = ?').bind(userId),
    db.prepare('SELECT skill_id FROM player_skills WHERE user_id = ?').bind(userId),
    db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC').bind(userId),
  ])
  const r = row.results[0] as any
  const equipped: PlayerState['equipped'] = {}
  for (const s of SLOTS) if (r[SLOT_COL[s.key]]) equipped[s.key] = r[SLOT_COL[s.key]]
  return {
    xp: r.xp,
    stats: { atk: r.stat_atk, hp: r.stat_hp, crit: r.stat_crit, heal: r.stat_heal },
    skills: (skills.results as any[]).map((s) => s.skill_id),
    stage: r.stage,
    resets: r.resets,
    gold: r.gold ?? 0,
    items: (items.results as any[]).map(toItem),
    equipped,
  }
}

export const logActivity = (db: D1Database, userId: string, kind: string, text: string) =>
  db.prepare('INSERT INTO activity (user_id, kind, text, created_at) VALUES (?, ?, ?, ?)').bind(userId, kind, text, Date.now())

export interface XpChange {
  amount: number
  gold: number
  bonuses: string[]
  level: number
  leveledUp: boolean
}

const effectsOf = (p: PlayerState) => equippedItems(p).map((i) => i.effect).filter((e): e is string => !!e)

/** タスクのステータス変化に応じて XP・ゴールドを付与・取り消しする。更新前のタスク行を受け取る */
export async function applyTaskXp(db: D1Database, userId: string, before: any, nextStatus: string): Promise<XpChange | null> {
  const wasDone = before.status === 'done'
  const isDone = nextStatus === 'done'
  if (wasDone === isDone) return null
  const player = await getPlayer(db, userId)
  const prevLevel = levelInfo(player.xp).level
  const now = Date.now()

  if (isDone) {
    const today = await db
      .prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done_at >= ? AND xp_awarded > 0')
      .bind(userId, jstDayStart(now))
      .first<{ n: number }>()
    const { amount, gold, bonuses } = computeXp({
      weight: before.weight as Weight | null,
      createdAt: before.created_at,
      now,
      doneToday: today?.n ?? 0,
      source: before.source,
      skills: player.skills,
      effects: effectsOf(player),
    })
    const level = levelInfo(player.xp + amount).level
    const stmts = [
      db.prepare('UPDATE players SET xp = xp + ?, gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(amount, gold, now, userId),
      db.prepare('UPDATE tasks SET xp_awarded = ?, done_at = ? WHERE id = ?').bind(amount, now, before.id),
      logActivity(db, userId, 'done', before.title),
    ]
    if (level > prevLevel) stmts.push(logActivity(db, userId, 'levelup', `Lv${level}`))
    await db.batch(stmts)
    return { amount, gold, bonuses, level, leveledUp: level > prevLevel }
  }

  // 完了から戻した: 付与済み XP とゴールドを取り消す
  const amount = before.xp_awarded ?? 0
  const gold = Math.ceil(amount / 2)
  await db.batch([
    db.prepare('UPDATE players SET xp = MAX(0, xp - ?), gold = MAX(0, gold - ?), updated_at = ? WHERE user_id = ?').bind(amount, gold, now, userId),
    db.prepare('UPDATE tasks SET xp_awarded = 0, done_at = NULL WHERE id = ?').bind(before.id),
  ])
  return { amount: -amount, gold: -gold, bonuses: [], level: levelInfo(Math.max(0, player.xp - amount)).level, leveledUp: false }
}

export async function addStat(db: D1Database, userId: string, stat: StatKey) {
  if (!STATS.some((s) => s.key === stat)) return { error: '不明なステータス' }
  const p = await getPlayer(db, userId)
  if (spInfo(p).free < 1) return { error: 'SPが足りません' }
  await db.prepare(`UPDATE players SET ${STAT_COL[stat]} = ${STAT_COL[stat]} + 1, updated_at = ? WHERE user_id = ?`).bind(Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

export async function learnSkill(db: D1Database, userId: string, skillId: string) {
  const p = await getPlayer(db, userId)
  const err = canLearn(p, skillId)
  if (err) return { error: err }
  await db.prepare('INSERT INTO player_skills (user_id, skill_id) VALUES (?, ?)').bind(userId, skillId).run()
  return { player: await getPlayer(db, userId) }
}

export async function resetBuild(db: D1Database, userId: string) {
  const p = await getPlayer(db, userId)
  if (p.resets < 1) return { error: 'リセットの書がありません' }
  await db.batch([
    db.prepare(
      'UPDATE players SET stat_atk = 0, stat_hp = 0, stat_crit = 0, stat_heal = 0, resets = resets - 1, updated_at = ? WHERE user_id = ?',
    ).bind(Date.now(), userId),
    db.prepare('DELETE FROM player_skills WHERE user_id = ?').bind(userId),
  ])
  return { player: await getPlayer(db, userId) }
}

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]

function insertItem(db: D1Database, userId: string, item: Omit<Item, 'id'>) {
  const id = crypto.randomUUID()
  return {
    item: { id, ...item } as Item,
    stmt: db
      .prepare(
        'INSERT INTO items (id, user_id, slot, name, icon, rarity, atk, hp, crit, heal, effect, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(id, userId, item.slot, item.name, item.icon, item.rarity, item.atk, item.hp, item.crit, item.heal, item.effect, Date.now()),
  }
}

/** SR 以上を引いたらみんなの「最近の動き」に流す */
const itemActivity = (db: D1Database, userId: string, item: Item) =>
  item.rarity === 'SSR' || item.rarity === 'SR' ? [logActivity(db, userId, 'item', `${item.rarity} ${item.icon} ${item.name}`)] : []

async function ensureDaily(db: D1Database, userId: string, day: number) {
  await db.prepare('INSERT OR IGNORE INTO daily (user_id, day) VALUES (?, ?)').bind(userId, day).run()
}

/** 現在のステージのボスに挑む。勝てば次のステージ・ゴールド・宝箱 (装備 1 つ)・リセットの書 */
export async function fight(db: D1Database, userId: string) {
  const p = await getPlayer(db, userId)
  const enemy = enemyForStage(p.stage)
  const result = simulateBattle(p, enemy, seed())
  const day = jstDayStart(Date.now())
  await ensureDaily(db, userId, day)
  const stmts: D1PreparedStatement[] = [db.prepare('UPDATE daily SET battles = battles + 1 WHERE user_id = ? AND day = ?').bind(userId, day)]
  let reward: { gold: number; item: Item | null } | null = null
  if (result.win) {
    const gold = bossGold(enemy.stage)
    // 宝箱は R 以上確定。持ち物がいっぱいならゴールドのみ
    let item: Item | null = null
    if (p.items.length < INVENTORY_MAX) {
      const rolled = rollItem(seed(), enemy.stage)
      const ins = insertItem(db, userId, rolled.rarity === 'N' ? { ...rollItem(seed(), enemy.stage, 'R') } : rolled)
      item = ins.item
      stmts.push(ins.stmt, ...itemActivity(db, userId, item))
    }
    stmts.push(
      db.prepare('UPDATE players SET stage = stage + 1, resets = resets + 1, gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(gold, Date.now(), userId),
      logActivity(db, userId, 'boss', `${enemy.icon} ${enemy.name}`),
    )
    reward = { gold, item }
  }
  await db.batch(stmts)
  return { result, reward, player: await getPlayer(db, userId) }
}

export async function openChest(db: D1Database, userId: string) {
  const p = await getPlayer(db, userId)
  if (p.gold < CHEST_COST) return { error: 'ゴールドが足りません' }
  if (p.items.length >= INVENTORY_MAX) return { error: '持ち物がいっぱいです' }
  const ins = insertItem(db, userId, rollItem(seed(), p.stage))
  await db.batch([
    db.prepare('UPDATE players SET gold = gold - ?, updated_at = ? WHERE user_id = ? AND gold >= ?').bind(CHEST_COST, Date.now(), userId, CHEST_COST),
    ins.stmt,
    ...itemActivity(db, userId, ins.item),
  ])
  return { item: ins.item, player: await getPlayer(db, userId) }
}

export async function equipItem(db: D1Database, userId: string, itemId: string, on: boolean) {
  const p = await getPlayer(db, userId)
  const item = p.items.find((i) => i.id === itemId)
  if (!item) return { error: 'アイテムがありません' }
  const col = SLOT_COL[item.slot]
  await db.prepare(`UPDATE players SET ${col} = ?, updated_at = ? WHERE user_id = ?`).bind(on ? item.id : null, Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

export async function sellItem(db: D1Database, userId: string, itemId: string) {
  const p = await getPlayer(db, userId)
  const item = p.items.find((i) => i.id === itemId)
  if (!item) return { error: 'アイテムがありません' }
  if (Object.values(p.equipped).includes(item.id)) return { error: '装備中は売れません' }
  await db.batch([
    db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(item.id, userId),
    db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(RARITY_SELL[item.rarity as Rarity], Date.now(), userId),
  ])
  return { player: await getPlayer(db, userId) }
}

// ---------- デイリーミッション ----------
async function dailyState(db: D1Database, userId: string) {
  const now = Date.now()
  const day = jstDayStart(now)
  await ensureDaily(db, userId, day)
  const [counts, row] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS done,
                SUM(weight = 'L') AS big,
                SUM(COALESCE(weight, 'M') IN ('M', 'L')) AS midPlus,
                SUM(done_at < ?) AS early
           FROM tasks WHERE user_id = ? AND done_at >= ? AND xp_awarded > 0`,
      )
      .bind(day + 9 * 3600000, userId, day),
    db.prepare('SELECT battles, claimed FROM daily WHERE user_id = ? AND day = ?').bind(userId, day),
  ])
  const c = counts.results[0] as any
  const d = row.results[0] as any
  const dc: DailyCounts = { done: c.done ?? 0, big: c.big ?? 0, midPlus: c.midPlus ?? 0, early: c.early ?? 0, battles: d.battles ?? 0 }
  const claimed = (d.claimed as string).split(',').filter(Boolean)
  const missions = dailyMissions(day).map((m) => ({ ...m, ...missionProgress(m, dc, claimed) }))
  return { day, claimed, missions }
}

export async function getMissions(db: D1Database, userId: string) {
  const { missions } = await dailyState(db, userId)
  return { missions }
}

export async function claimMission(db: D1Database, userId: string, missionId: string) {
  const { day, claimed, missions } = await dailyState(db, userId)
  const m = missions.find((x) => x.id === missionId)
  if (!m) return { error: '今日のミッションではありません' }
  if (m.claimed) return { error: '受け取り済みです' }
  if (!m.done) return { error: 'まだ達成していません' }
  const p = await getPlayer(db, userId)
  const stmts: D1PreparedStatement[] = [
    db.prepare('UPDATE daily SET claimed = ? WHERE user_id = ? AND day = ?').bind([...claimed, m.id].join(','), userId, day),
    db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(m.gold, Date.now(), userId),
  ]
  let item: Item | null = null
  if (m.chest && p.items.length < INVENTORY_MAX) {
    const ins = insertItem(db, userId, rollItem(seed(), p.stage))
    item = ins.item
    stmts.push(ins.stmt, ...itemActivity(db, userId, item))
  }
  await db.batch(stmts)
  return { item, gold: m.gold, player: await getPlayer(db, userId), missions: (await dailyState(db, userId)).missions }
}

// ---------- 7 日経過した完了タスクの削除 ----------
export const doneCutoff = () => Date.now() - DONE_KEEP_DAYS * 86400000

export async function purgeOldDone(db: D1Database) {
  const res = await db
    .prepare("DELETE FROM tasks WHERE status = 'done' AND COALESCE(done_at, updated_at) < ?")
    .bind(doneCutoff())
    .run()
  // 最近の動きも 30 日より前は削除
  await db.prepare('DELETE FROM activity WHERE created_at < ?').bind(Date.now() - 30 * 86400000).run()
  return res.meta.changes ?? 0
}

// ---------- AI によるタスクの重さ判定 ----------
const WEIGHT_PROMPT = `各タスクの作業量を S(15分以内) / M(1〜2時間) / L(半日以上・複数工程) で判定してください。
入力は「番号: タスク」の行です。JSON {"weights": ["S"|"M"|"L", ...]} を入力と同じ順で返してください。`

export async function classifyWeights(env: Env, tasks: { id: string; title: string }[]) {
  if (!tasks.length) return
  try {
    const res: any = await env.AI.run('@cf/google/gemma-4-26b-a4b-it' as any, {
      messages: [
        { role: 'system', content: WEIGHT_PROMPT },
        { role: 'user', content: tasks.map((t, i) => `${i + 1}: ${t.title}`).join('\n') },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: { weights: { type: 'array', items: { type: 'string', enum: ['S', 'M', 'L'] } } },
          required: ['weights'],
        },
      },
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: 300,
      temperature: 0,
    } as any)
    const text = res?.choices?.[0]?.message?.content ?? res?.response
    const data = typeof text === 'string' ? JSON.parse(text) : text
    const weights: string[] = data?.weights ?? []
    const stmts = tasks
      .map((t, i) => (['S', 'M', 'L'].includes(weights[i]) ? env.DB.prepare('UPDATE tasks SET weight = ? WHERE id = ? AND weight IS NULL').bind(weights[i], t.id) : null))
      .filter((s): s is D1PreparedStatement => !!s)
    if (stmts.length) await env.DB.batch(stmts)
  } catch (e) {
    // 判定できなければ M 扱い (XP 計算側の既定値)
    console.error('weight classify failed', e)
  }
}
