import type { Env } from './env'
import { san } from '../shared/types'
import { track } from './usage'
import { JOB_MAP, JOB_UNLOCK_LEVEL, advancedOf, unlockedJobs } from './jobs'
import { SECRET_MAP, bonusOf, visibleSecrets } from './secrets'
import { achievementStats, doneDays, jstDayNo } from './achievements'
import { ACHIEVEMENT_MAP, streakOf } from '../shared/achievements'
import {
  BAG_MAX_BUYS,
  BAG_STEP,
  BOOST_COUNT,
  TREAT_GOLD,
  enhanceGold,
  shopPrice,
  EVENT_SKIN_MAP,
  EVENT_XP,
  PET_MAP,
  PLUS_MAX,
  lowerRarity,
  materialsFor,
  SHOP,
  activeEvent,
  hasEventSkin,
  petUnlocked,
  plusUp,
  plusUpN,
  enhanceTo,
  srChestRarity,
  type ShopId,
} from '../shared/extras'
import {
  DEFAULT_JOB,
  EARLY_HOUR,
  jobLevelInfo,
  CHEST_COST,
  ACTIVITY_KEEP_DAYS,
  DONE_KEEP_DAYS,
  HISTORY_KEEP_DAYS,
  SKIN_MAP,
  childXp,
  skinUnlocked,
  invMax,
  RARITY_SELL,
  SLOTS,
  bossGold,
  canLearn,
  computeXp,
  dailyMissions,
  enemyForStage,
  equippedItems,
  jstDayStart,
  jstToday,
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
const SLOT_COL: Record<Slot, string> = { head: 'eq_head', body: 'eq_body', feet: 'eq_feet', weapon: 'eq_weapon' }

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
  plus: r.plus ?? 0,
})

export async function getPlayer(db: D1Database, userId: string): Promise<PlayerState> {
  await db.prepare('INSERT OR IGNORE INTO players (user_id, updated_at) VALUES (?, ?)').bind(userId, Date.now()).run()
  const [row, skills, items, jobRows, achRows, skinRows, treatRow] = await db.batch([
    db.prepare('SELECT * FROM players WHERE user_id = ?').bind(userId),
    db.prepare('SELECT skill_id FROM player_skills WHERE user_id = ?').bind(userId),
    db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC').bind(userId),
    db.prepare('SELECT job_id, xp FROM player_jobs WHERE user_id = ?').bind(userId),
    db.prepare('SELECT achievement_id, unlocked_at FROM player_achievements WHERE user_id = ? ORDER BY unlocked_at').bind(userId),
    db.prepare('SELECT skin_id FROM owned_skins WHERE user_id = ?').bind(userId),
    db.prepare('SELECT 1 FROM treats WHERE user_id = ? AND day = ?').bind(userId, jstToday()),
  ])
  const achievements = (achRows.results as any[]).map((a) => ({ id: a.achievement_id as string, at: a.unlocked_at as number }))
  const r = row.results[0] as any
  const equipped: PlayerState['equipped'] = {}
  for (const s of SLOTS) if (r[SLOT_COL[s.key]]) equipped[s.key] = r[SLOT_COL[s.key]]
  const jobXp: Record<string, number> = Object.fromEntries((jobRows.results as any[]).map((j) => [j.job_id, j.xp]))
  const levels = Object.fromEntries(Object.keys(JOB_MAP).map((id) => [id, jobLevelInfo(jobXp[id] ?? 0).level]))
  const choices = unlockedJobs(levels)
  // 選べない職業 (データ不整合など) なら初期職業として扱う
  const job = choices.find((j) => j.id === r.job) ?? DEFAULT_JOB
  const ownedSkills = (skills.results as any[]).map((s) => s.skill_id as string)
  return {
    xp: r.xp,
    stats: { atk: r.stat_atk, hp: r.stat_hp, crit: r.stat_crit, heal: r.stat_heal },
    skills: ownedSkills,
    stage: r.stage,
    gold: r.gold ?? 0,
    items: (items.results as any[]).map(toItem),
    equipped,
    job,
    jobLevel: levels[job.id],
    jobs: choices.map((j) => ({
      id: j.id,
      name: j.name,
      icon: j.icon,
      desc: j.desc,
      tier: j.tier,
      xp: jobXp[j.id] ?? 0,
      ...jobLevelInfo(jobXp[j.id] ?? 0),
    })),
    secretSkills: visibleSecrets(ownedSkills),
    bonus: bonusOf(ownedSkills),
    skin: r.skin && (SKIN_MAP[r.skin] || EVENT_SKIN_MAP[r.skin]) ? r.skin : null,
    pet: r.pet && PET_MAP[r.pet] ? r.pet : null,
    boostLeft: r.boost_left ?? 0,
    invExtra: r.inv_extra ?? 0,
    ownedSkins: (skinRows.results as any[]).map((s) => s.skin_id as string),
    treated: treatRow.results.length > 0,
    title: r.title && achievements.some((a) => a.id === r.title) ? r.title : null,
    streak: streakOf(await doneDays(db, userId), jstDayNo(Date.now())),
    achievements,
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
  /** この完了で上位職が解放された */
  unlocked?: { name: string; icon: string } | null
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
    const day = jstDayStart(now)
    const counts = await db
      .prepare('SELECT SUM(done_at >= ?) AS today, SUM(done_at >= ? AND done_at < ?) AS yesterday FROM tasks WHERE user_id = ? AND xp_awarded > 0')
      .bind(day, day - 86400000, day, userId)
      .first<{ today: number | null; yesterday: number | null }>()
    const { amount, gold, bonuses } = computeXp({
      weight: (before.weight_user ?? before.weight) as Weight | null,
      base: await splitBase(db, before),
      createdAt: before.created_at,
      now,
      doneToday: counts?.today ?? 0,
      doneYesterday: (counts?.yesterday ?? 0) > 0,
      source: before.source,
      skills: player.skills,
      effects: effectsOf(player),
      bonus: player.bonus,
      extras: taskExtras(player),
    })
    const level = levelInfo(player.xp + amount).level
    // 今の職業にも同じだけ職業 XP が入る。基本職が規定レベルに届いたら上位職が解放される
    const jobId = player.job.id
    const jobXp = player.jobs.find((j) => j.id === jobId)?.xp ?? 0
    const adv = player.job.tier === 1 ? advancedOf(jobId) : undefined
    const unlocked =
      adv && jobLevelInfo(jobXp).level < JOB_UNLOCK_LEVEL && jobLevelInfo(jobXp + amount).level >= JOB_UNLOCK_LEVEL
        ? { name: adv.name, icon: adv.icon }
        : null
    const stmts = [
      // XP 2 倍チケットを使ったら 1 回分減らす
      db
        .prepare('UPDATE players SET xp = xp + ?, gold = gold + ?, boost_left = MAX(0, boost_left - ?), updated_at = ? WHERE user_id = ?')
        .bind(amount, gold, (player.boostLeft ?? 0) > 0 && amount > 0 ? 1 : 0, now, userId),
      db
        .prepare('INSERT INTO player_jobs (user_id, job_id, xp) VALUES (?, ?, ?) ON CONFLICT(user_id, job_id) DO UPDATE SET xp = xp + excluded.xp')
        .bind(userId, jobId, amount),
      db
        .prepare('UPDATE tasks SET xp_awarded = ?, gold_awarded = ?, xp_job = ?, done_at = ? WHERE id = ?')
        .bind(amount, gold, jobId, now, before.id),
      logActivity(db, userId, 'done', before.title),
    ]
    if (level > prevLevel) stmts.push(logActivity(db, userId, 'levelup', `Lv${level}`))
    if (unlocked) stmts.push(logActivity(db, userId, 'job', `${unlocked.icon} ${unlocked.name}`))
    await db.batch(stmts)
    return { amount, gold, bonuses, level, leveledUp: level > prevLevel, unlocked }
  }

  // 完了から戻した: 付与済み XP・ゴールド・職業 XP を取り消す
  const amount = before.xp_awarded ?? 0
  const gold = before.gold_awarded ?? Math.ceil(amount / 2)
  await db.batch([
    db.prepare('UPDATE players SET xp = MAX(0, xp - ?), gold = MAX(0, gold - ?), updated_at = ? WHERE user_id = ?').bind(amount, gold, now, userId),
    db.prepare('UPDATE player_jobs SET xp = MAX(0, xp - ?) WHERE user_id = ? AND job_id = ?').bind(amount, userId, before.xp_job ?? player.job.id),
    db.prepare('UPDATE tasks SET xp_awarded = 0, gold_awarded = 0, xp_job = NULL, done_at = NULL WHERE id = ?').bind(before.id),
  ])
  return { amount: -amount, gold: -gold, bonuses: [], level: levelInfo(Math.max(0, player.xp - amount)).level, leveledUp: false }
}

/** ペット・開催中の季節イベント・XP 2 倍チケットの上乗せ */
function taskExtras(p: PlayerState) {
  const list: { label: string; xp?: number; gold?: number; double?: boolean }[] = []
  const pet = p.pet ? PET_MAP[p.pet] : undefined
  if (pet && (pet.xp || pet.gold)) list.push({ label: `${pet.emoji}${pet.name}`, xp: pet.xp, gold: pet.gold })
  const ev = activeEvent(jstToday())
  if (ev) list.push({ label: `${ev.icon}${ev.name} +${Math.round(EVENT_XP * 100)}%`, xp: EVENT_XP })
  if ((p.boostLeft ?? 0) > 0) list.push({ label: '🎫XP2倍', double: true })
  return list
}

/** 取った実績の数 (ペットの解放に使う。季節イベントの記録は数えない) */
const achievementCount = (p: PlayerState) => (p.achievements ?? []).filter((a) => ACHIEVEMENT_MAP[a.id]).length

/** 連れていくペットの変更 (null で連れていかない) */
export async function setPet(db: D1Database, userId: string, pet: string | null) {
  const p = await getPlayer(db, userId)
  if (pet !== null) {
    const def = PET_MAP[pet]
    if (!def) return { error: '存在しないペット' }
    const stats = def.need.stat === 'achievements' ? null : await achievementStats(db, userId)
    if (!petUnlocked(def, achievementCount(p), stats)) return { error: `${def.need.label}で仲間になります` }
  }
  await db.prepare('UPDATE players SET pet = ?, updated_at = ? WHERE user_id = ?').bind(pet, Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

/**
 * 装備の強化 (+1)。同じ部位・同じレア度の (装備していない) 装備を 1 つ使うか、
 * by = 'gold' ならゴールドを払う (値段はレア度 × 次の段階)
 */
export async function enhanceItem(db: D1Database, userId: string, itemId: string, by: 'item' | 'gold' = 'item', materialId?: string) {
  const p = await getPlayer(db, userId)
  const item = p.items.find((i) => i.id === itemId)
  if (!item) return { error: 'アイテムがありません' }
  if ((item.plus ?? 0) >= PLUS_MAX) return { error: `+${PLUS_MAX}が最大です` }
  const up = db
    .prepare('UPDATE items SET plus = plus + 1, atk = ?, hp = ?, crit = ?, heal = ? WHERE id = ? AND user_id = ?')
    .bind(plusUp(item.atk), plusUp(item.hp), plusUp(item.crit), plusUp(item.heal), item.id, userId)
  if (by === 'gold') {
    const price = enhanceGold(item.rarity, item.plus ?? 0)
    if (p.gold < price) return { error: 'ゴールドが足りません' }
    // 払えたときだけ強化する (同時に押しても二重に払わない)
    const pay = await db.prepare('UPDATE players SET gold = gold - ?, updated_at = ? WHERE user_id = ? AND gold >= ?').bind(price, Date.now(), userId, price).run()
    if (!pay.meta.changes) return { error: 'ゴールドが足りません' }
    await up.run()
    return { player: await getPlayer(db, userId) }
  }
  // 素材は選んだもの (選んでいなければ使える中の先頭)
  const usable = materialsFor(item, p.items, Object.values(p.equipped) as string[])
  const material = materialId ? usable.find((i) => i.id === materialId) : usable[0]
  if (!material) {
    if (materialId) return { error: 'その装備は素材に使えません' }
    const lower = lowerRarity(item.rarity)
    return { error: `同じ部位の${item.rarity}の装備${lower ? `か、${lower}の+${PLUS_MAX}の装備` : ''}がもう1つ必要です` }
  }
  // 素材の強化段階を引き継ぐ (同じレア度のとき)。強化前の段階が変わっていなければ (同時に押していなければ) 反映
  const before = item.plus ?? 0
  const after = enhanceTo(item, material)
  const steps = after - before
  const r = await db.batch([
    db
      .prepare('UPDATE items SET plus = ?, atk = ?, hp = ?, crit = ?, heal = ? WHERE id = ? AND user_id = ? AND plus = ?')
      .bind(after, plusUpN(item.atk, steps), plusUpN(item.hp, steps), plusUpN(item.crit, steps), plusUpN(item.heal, steps), item.id, userId, before),
    db.prepare('DELETE FROM items WHERE id = ? AND user_id = ? AND changes() > 0').bind(material.id, userId),
  ])
  if (!r[0].meta.changes) return { error: 'もう一度お試しください' }
  return { player: await getPlayer(db, userId), plus: after, gained: steps }
}

/**
 * ショップ: XP 2 倍チケット / SR 以上確定の宝箱 / 持ち物の枠 / みんなへの差し入れ。
 * 差し入れはほかのメンバー (members) に配る
 */
export async function buyShop(db: D1Database, userId: string, id: ShopId, members: { id: string; name: string }[] = []) {
  const def = SHOP.find((s) => s.id === id)
  if (!def) return { error: '売っていません' }
  const p = await getPlayer(db, userId)
  const price = shopPrice(id, p.invExtra)
  if (p.gold < price) return { error: 'ゴールドが足りません' }
  const now = Date.now()
  const pay = db.prepare('UPDATE players SET gold = gold - ?, updated_at = ? WHERE user_id = ? AND gold >= ?').bind(price, now, userId, price)
  if (id === 'boost') {
    await db.batch([pay, db.prepare('UPDATE players SET boost_left = boost_left + ? WHERE user_id = ?').bind(BOOST_COUNT, userId)])
    return { player: await getPlayer(db, userId), item: null }
  }
  if (id === 'bag') {
    if ((p.invExtra ?? 0) >= BAG_STEP * BAG_MAX_BUYS) return { error: `持ち物の枠は+${BAG_STEP * BAG_MAX_BUYS}までです` }
    // 値段は買った回数で決まるので、回数が変わっていないときだけ増やす
    const r = await db
      .prepare('UPDATE players SET gold = gold - ?, inv_extra = inv_extra + ?, updated_at = ? WHERE user_id = ? AND gold >= ? AND inv_extra = ?')
      .bind(price, BAG_STEP, now, userId, price, p.invExtra ?? 0)
      .run()
    if (!r.meta.changes) return { error: 'もう一度お試しください' }
    return { player: await getPlayer(db, userId), item: null }
  }
  if (id === 'treat') {
    const me = members.find((m) => m.id === userId)
    const others = members.filter((m) => m.id !== userId)
    if (!others.length) return { error: 'ほかのメンバーがいません' }
    const ins = await db.prepare('INSERT OR IGNORE INTO treats (user_id, day, created_at) VALUES (?, ?, ?)').bind(userId, jstToday(), now).run()
    if (!ins.meta.changes) return { error: '差し入れは1日1回です' }
    await db.batch([
      pay,
      ...others.map((m) => db.prepare('INSERT OR IGNORE INTO players (user_id, updated_at) VALUES (?, ?)').bind(m.id, now)),
      ...others.map((m) => db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(TREAT_GOLD, now, m.id)),
      ...others.map((m) => track(db, m.id, 'treat_received', TREAT_GOLD)),
      ...others.map((m) => notify(db, m.id, userId, 'treat', null, `${san(me?.name ?? '')}から差し入れ 🍩 💰${TREAT_GOLD}`)),
      logActivity(db, userId, 'treat', 'みんなに差し入れ 🍩'),
    ])
    return { player: await getPlayer(db, userId), item: null }
  }
  if (p.items.length >= invMax(p)) return { error: '持ち物がいっぱいです' }
  const r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
  const ins = insertItem(db, userId, rollItem(seed(), p.stage, srChestRarity(r)))
  await db.batch([pay, ins.stmt, ...itemActivity(db, userId, ins.item)])
  return { player: await getPlayer(db, userId), item: ins.item }
}

/** 分解まわりの基本 XP。分解済みの元タスクは 0、子タスクは元タスクの XP を兄弟の数で割った値 */
async function splitBase(db: D1Database, task: any): Promise<number | undefined> {
  if (task.parent_id) {
    // 元タスクを消しても分け合う形は変わらない (消して満額にする稼ぎ防止)
    const r = await db
      .prepare('SELECT (SELECT COALESCE(weight_user, weight) FROM tasks WHERE id = ?1) AS weight, COUNT(*) AS n FROM tasks WHERE parent_id = ?1')
      .bind(task.parent_id)
      .first<{ weight: Weight | null; n: number }>()
    return childXp(r?.weight ?? null, r?.n ?? 1)
  }
  const kids = await db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent_id = ?').bind(task.id).first<{ n: number }>()
  return kids?.n ? 0 : undefined
}

/**
 * 他の人のタスクを進めた人への手伝い XP。同じタスク・同じ段階では 1 回だけ (持ち主が戻して進め直しても増えない)。
 * 付与しなかったときは null
 */
export async function awardHelp(db: D1Database, userId: string, taskId: string, kind: 'doing' | 'done', amount: number): Promise<XpChange | null> {
  const now = Date.now()
  const ins = await db
    .prepare('INSERT OR IGNORE INTO helps (task_id, user_id, kind, xp, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(taskId, userId, kind, amount, now)
    .run()
  if (!ins.meta.changes) return null
  const player = await getPlayer(db, userId)
  const prevLevel = levelInfo(player.xp).level
  const gold = Math.ceil(amount / 2)
  await db.batch([
    db.prepare('UPDATE players SET xp = xp + ?, gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(amount, gold, now, userId),
    db
      .prepare('INSERT INTO player_jobs (user_id, job_id, xp) VALUES (?, ?, ?) ON CONFLICT(user_id, job_id) DO UPDATE SET xp = xp + excluded.xp')
      .bind(userId, player.job.id, amount),
  ])
  const level = levelInfo(player.xp + amount).level
  return { amount, gold, bonuses: ['手伝いボーナス'], level, leveledUp: level > prevLevel }
}

/** 称号の変更 (null で外す)。取った実績のものだけ */
export async function setTitle(db: D1Database, userId: string, title: string | null) {
  if (title !== null) {
    const has = await db.prepare('SELECT 1 FROM player_achievements WHERE user_id = ? AND achievement_id = ?').bind(userId, title).first()
    if (!has) return { error: 'まだ取っていない実績です' }
  }
  await db.prepare('UPDATE players SET title = ?, updated_at = ? WHERE user_id = ?').bind(title, Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

/** スキンの変更 (null で Google の写真に戻す)。解放済みのものだけ */
export async function setSkin(db: D1Database, userId: string, skin: string | null) {
  const p = await getPlayer(db, userId)
  if (skin !== null) {
    const ev = EVENT_SKIN_MAP[skin]
    if (ev) {
      if (!hasEventSkin((p.achievements ?? []).map((a) => a.id), ev.event)) return { error: `${ev.eventName}のイベントで手に入るスキンです` }
    } else {
      const def = SKIN_MAP[skin]
      if (!def) return { error: '存在しないスキン' }
      if (!skinUnlocked(def, levelInfo(p.xp).level, p.stage, p.ownedSkins)) return { error: def.price ? 'まだ買っていないスキンです' : 'まだ解放されていません' }
    }
  }
  await db.prepare('UPDATE players SET skin = ?, updated_at = ? WHERE user_id = ?').bind(skin, Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

/** ゴールドでスキンを買う (買うとすぐ着替える) */
export async function buySkin(db: D1Database, userId: string, skin: string) {
  const def = SKIN_MAP[skin]
  if (!def?.price) return { error: '売っていないスキンです' }
  const p = await getPlayer(db, userId)
  if (p.ownedSkins?.includes(skin)) return { error: 'もう持っています' }
  if (p.gold < def.price) return { error: 'ゴールドが足りません' }
  const now = Date.now()
  const pay = await db
    .prepare('UPDATE players SET gold = gold - ?, skin = ?, updated_at = ? WHERE user_id = ? AND gold >= ? AND NOT EXISTS (SELECT 1 FROM owned_skins WHERE user_id = ? AND skin_id = ?)')
    .bind(def.price, skin, now, userId, def.price, userId, skin)
    .run()
  if (!pay.meta.changes) return { error: 'ゴールドが足りません' }
  await db.prepare('INSERT OR IGNORE INTO owned_skins (user_id, skin_id, created_at) VALUES (?, ?, ?)').bind(userId, skin, now).run()
  return { player: await getPlayer(db, userId) }
}

export async function addStat(db: D1Database, userId: string, stat: StatKey) {
  if (!STATS.some((s) => s.key === stat)) return { error: '不明なステータス' }
  const p = await getPlayer(db, userId)
  if (spInfo(p).free < 1) return { error: 'SPが足りません' }
  await db.prepare(`UPDATE players SET ${STAT_COL[stat]} = ${STAT_COL[stat]} + 1, updated_at = ? WHERE user_id = ?`).bind(Date.now(), userId).run()
  return { player: await getPlayer(db, userId) }
}

/** スキル習得。隠しスキルは条件 (知恵 × 攻撃/守護) を満たして見えているものだけ覚えられる */
export async function learnSkill(db: D1Database, userId: string, skillId: string) {
  const p = await getPlayer(db, userId)
  const secret = SECRET_MAP[skillId]
  if (secret) {
    const view = p.secretSkills.find((s) => s.id === skillId)
    if (!view) return { error: '存在しないスキル' }
    if (view.owned) return { error: '習得済み' }
    if (spInfo(p).free < secret.cost) return { error: 'SPが足りません' }
    await db.batch([
      db.prepare('INSERT INTO player_skills (user_id, skill_id) VALUES (?, ?)').bind(userId, skillId),
      logActivity(db, userId, 'skill', secret.name),
    ])
    return { player: await getPlayer(db, userId), revealed: [] }
  }
  const err = canLearn(p, skillId)
  if (err) return { error: err }
  await db.prepare('INSERT INTO player_skills (user_id, skill_id) VALUES (?, ?)').bind(userId, skillId).run()
  const next = await getPlayer(db, userId)
  // この習得で新しく現れた隠しスキル
  const before = new Set(p.secretSkills.map((s) => s.id))
  const revealed = next.secretSkills.filter((s) => !before.has(s.id)).map((s) => ({ name: s.name, combo: s.combo }))
  return { player: next, revealed }
}

/** SP の振り直し (何度でも無料) */
export async function resetBuild(db: D1Database, userId: string) {
  await db.batch([
    db.prepare('UPDATE players SET stat_atk = 0, stat_hp = 0, stat_crit = 0, stat_heal = 0, updated_at = ? WHERE user_id = ?').bind(Date.now(), userId),
    db.prepare('DELETE FROM player_skills WHERE user_id = ?').bind(userId),
  ])
  return { player: await getPlayer(db, userId) }
}

/** 冒険職の変更 (いつでも自由。解放済みの職業のみ) */
export async function setJob(db: D1Database, userId: string, jobId: string) {
  const p = await getPlayer(db, userId)
  if (!p.jobs.some((j) => j.id === jobId)) return { error: 'その職業は選べません' }
  await db.prepare('UPDATE players SET job = ?, updated_at = ? WHERE user_id = ?').bind(jobId, Date.now(), userId).run()
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

/** 他のファイル (レイド) から装備を作るとき用 */
export const insertItemFor = (db: D1Database, userId: string, item: Omit<Item, 'id'>) => insertItem(db, userId, item)

/** SR 以上を引いたらみんなの「最近の動き」に流す */
const itemActivity = (db: D1Database, userId: string, item: Item) =>
  item.rarity === 'UR' || item.rarity === 'SSR' || item.rarity === 'SR' ? [logActivity(db, userId, 'item', `${item.rarity} ${item.name}`)] : []

export async function ensureDaily(db: D1Database, userId: string, day: number) {
  await db.prepare('INSERT OR IGNORE INTO daily (user_id, day) VALUES (?, ?)').bind(userId, day).run()
}

/** その日の「追加した件数」「進行中にした件数」を数える (デイリーミッション用) */
export async function countDaily(db: D1Database, userId: string, col: 'adds' | 'doings', n = 1) {
  const day = jstDayStart(Date.now())
  await ensureDaily(db, userId, day)
  await db.prepare(`UPDATE daily SET ${col} = ${col} + ? WHERE user_id = ? AND day = ?`).bind(n, userId, day).run()
}

/** 現在のステージのボスに挑む。勝てば次のステージ・ゴールド・宝箱 (装備 1 つ) */
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
    if (p.items.length < invMax(p)) {
      const rolled = rollItem(seed(), enemy.stage)
      const ins = insertItem(db, userId, rolled.rarity === 'N' ? { ...rollItem(seed(), enemy.stage, 'R') } : rolled)
      item = ins.item
      stmts.push(ins.stmt, ...itemActivity(db, userId, item))
    }
    stmts.push(
      db.prepare('UPDATE players SET stage = stage + 1, gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(gold, Date.now(), userId),
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
  if (p.items.length >= invMax(p)) return { error: '持ち物がいっぱいです' }
  const ins = insertItem(db, userId, rollItem(seed(), p.stage))
  const day = jstDayStart(Date.now())
  await ensureDaily(db, userId, day)
  await db.batch([
    db.prepare('UPDATE players SET gold = gold - ?, updated_at = ? WHERE user_id = ? AND gold >= ?').bind(CHEST_COST, Date.now(), userId, CHEST_COST),
    ins.stmt,
    db.prepare('UPDATE daily SET chests = chests + 1 WHERE user_id = ? AND day = ?').bind(userId, day),
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

/** まとめて装備する (おまかせ装備)。部位ごとに自分の装備の ID か、外すなら null */
export async function equipSet(db: D1Database, userId: string, set: Partial<Record<Slot, string | null>>) {
  const p = await getPlayer(db, userId)
  const cols: string[] = []
  const vals: (string | null)[] = []
  for (const s of SLOTS) {
    if (!(s.key in set)) continue
    const id = set[s.key] ?? null
    if (id !== null) {
      const item = p.items.find((i) => i.id === id)
      if (!item || item.slot !== s.key) return { error: 'その装備はつけられません' }
    }
    cols.push(`${SLOT_COL[s.key]} = ?`)
    vals.push(id)
  }
  if (!cols.length) return { player: p }
  await db.prepare(`UPDATE players SET ${cols.join(', ')}, updated_at = ? WHERE user_id = ?`).bind(...vals, Date.now(), userId).run()
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
                SUM(COALESCE(weight_user, weight) IN ('L', 'XL')) AS big,
                SUM(COALESCE(weight_user, weight, 'M') IN ('M', 'L', 'XL')) AS midPlus,
                SUM(done_at < ?) AS early,
                SUM(due_date IS NOT NULL AND due_date >= date(done_at / 1000 + 9 * 3600, 'unixepoch')) AS ontime,
                SUM(parent_id IS NOT NULL) AS split
           FROM tasks WHERE user_id = ? AND done_at >= ? AND xp_awarded > 0`,
      )
      .bind(day + EARLY_HOUR * 3600000, userId, day),
    db.prepare('SELECT battles, adds, doings, chests, claimed FROM daily WHERE user_id = ? AND day = ?').bind(userId, day),
  ])
  const c = counts.results[0] as any
  const d = row.results[0] as any
  const dc: DailyCounts = {
    done: c.done ?? 0,
    big: c.big ?? 0,
    midPlus: c.midPlus ?? 0,
    early: c.early ?? 0,
    ontime: c.ontime ?? 0,
    split: c.split ?? 0,
    battles: d.battles ?? 0,
    adds: d.adds ?? 0,
    doings: d.doings ?? 0,
    chests: d.chests ?? 0,
  }
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
  if (m.chest && p.items.length < invMax(p)) {
    const ins = insertItem(db, userId, rollItem(seed(), p.stage))
    item = ins.item
    stmts.push(ins.stmt, ...itemActivity(db, userId, item))
  }
  await db.batch(stmts)
  return { item, gold: m.gold, player: await getPlayer(db, userId), missions: (await dailyState(db, userId)).missions }
}

// ---------- 古いデータの整理 ----------
/** 完了から 7 日経ったタスクはボードに出さない (履歴としては残る) */
export const doneCutoff = () => Date.now() - DONE_KEEP_DAYS * 86400000

export async function purgeOldDone(db: D1Database) {
  const now = Date.now()
  const res = await db
    .prepare("DELETE FROM tasks WHERE status = 'done' AND COALESCE(done_at, updated_at) < ?")
    .bind(now - HISTORY_KEEP_DAYS * 86400000)
    .run()
  await db.batch([
    db.prepare('DELETE FROM activity WHERE created_at < ?').bind(now - ACTIVITY_KEEP_DAYS * 86400000),
    db.prepare('DELETE FROM notifications WHERE created_at < ?').bind(now - 30 * 86400000),
    db.prepare('DELETE FROM errors WHERE created_at < ?').bind(now - 30 * 86400000),
    db.prepare('DELETE FROM usage WHERE created_at < ?').bind(now - 90 * 86400000),
  ])
  return res.meta.changes ?? 0
}

/** アプリ内通知を作る (自分宛てには作らない) */
export const notify = (db: D1Database, userId: string, actorId: string, kind: string, taskId: string | null, text: string) =>
  db
    .prepare('INSERT INTO notifications (user_id, actor_id, kind, task_id, text, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ? <> ?')
    .bind(userId, actorId, kind, taskId, text, Date.now(), userId, actorId)

// ---------- AI によるタスクの重さ判定 ----------
const WEIGHT_PROMPT = `あなたは会社員のタスクの作業量を見積もる係です。各タスクを、完了までにかかる実際の作業量で 4 段階に分けてください。

XL (特大): 件名が「案件・プロジェクトの全体」を指すものだけ。めったに付けない (全体の 1 割未満)。
  会社や部署全体に関わる制度・規程の見直し、補助金・助成金の案件全体、事業計画・採用計画づくり、システムの導入・移管・移行・刷新など、
  完了まで数週間〜数か月かかり、多くの人・部署・社外とのやり取りがあるもの。
  例: 「全社就業規則見直し」「省力化補助金」「CDO事業計画」「弥生販売システム移管」「人事評価制度の刷新」「新卒採用計画」
  案件の中の 1 つの作業 (打ち合わせ・対応・提出・申請書の作成・準備・連絡など) は XL にしない。内容に応じて L か M にする。
  締切付きの申請や提出、イベントの準備も XL ではなく L。迷ったら L にする。
L (大): 半日〜数日。1 人でまとまった時間をかけて作る成果物や、大きめの準備・申請・提出。
  例: 「新人研修の資料作成」「取締役会の議案資料を作る」「四半期の売上分析レポート」「助成金申請（12/15〆）」「補助金の事務局対応と打ち合わせ」「店舗の消防計画を提出する」
M (中): 1〜2 時間。報告・見積書・議事録・打ち合わせの準備など、まとまった作業 1 つ。
  例: 「週次報告をまとめる」「見積書を作成する」「会議の議事録をまとめる」
S (小): 15 分以内。連絡・予約・登録・コピー・回覧・確認など、すぐ終わる作業。
  大きな案件の名前が入っていても、その作業自体が小さければ S。
  例: 「会議室を予約する」「補助金の申請書をコピーして回覧する」「弥生販売に得意先を1件登録する」

入力は「番号: タスク」の行です。JSON {"weights": ["S"|"M"|"L"|"XL", ...]} を入力と同じ順で返してください。`

/**
 * AI で作業量 (小・中・大・特大) を判定して保存する。失敗した分は 1 回だけやり直す。
 * それでも残ったものは、一覧を開いたときや毎晩の整理で判定し直す (sweepUnjudged)
 */
export async function classifyWeights(env: Env, tasks: { id: string; title: string }[]) {
  if (!tasks.length) return
  const left = await classifyOnce(env, tasks)
  if (left.length) await classifyOnce(env, left)
}

/** 1 回判定して、判定できなかったタスクを返す */
async function classifyOnce(env: Env, tasks: { id: string; title: string }[]) {
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
          properties: { weights: { type: 'array', items: { type: 'string', enum: ['S', 'M', 'L', 'XL'] } } },
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
    const ok = (i: number) => ['S', 'M', 'L', 'XL'].includes(weights[i])
    const stmts = tasks.flatMap((t, i) => (ok(i) ? [env.DB.prepare('UPDATE tasks SET weight = ? WHERE id = ? AND weight IS NULL').bind(weights[i], t.id)] : []))
    if (stmts.length) await env.DB.batch(stmts)
    return tasks.filter((_, i) => !ok(i))
  } catch (e) {
    // 判定できないあいだは「中」として XP を計算する (XP 計算側の既定値)
    console.error('weight classify failed', e)
    return tasks
  }
}

/** 同じ人の判定し直しは 5 分に 1 回まで (この Worker のインスタンスの中で) */
const lastSweep = new Map<string, number>()

/**
 * 判定が終わっていない未完了のタスク (追加から 1 分以上たったもの) を判定し直す。
 * userId を渡すとその人の分だけ (一覧を開いたとき)、渡さなければ全員分 (毎晩)
 */
export async function sweepUnjudged(env: Env, userId?: string) {
  const now = Date.now()
  if (userId) {
    if (now - (lastSweep.get(userId) ?? 0) < 5 * 60000) return 0
    lastSweep.set(userId, now)
  }
  const { results } = await env.DB.prepare(
    `SELECT id, title FROM tasks WHERE weight IS NULL AND status <> 'done' AND created_at < ? AND created_at > ? ${userId ? 'AND user_id = ?' : ''} ORDER BY created_at LIMIT ${userId ? 10 : 50}`,
  )
    .bind(now - 60000, now - 30 * 86400000, ...(userId ? [userId] : []))
    .all<{ id: string; title: string }>()
  // 一度に頼みすぎないよう 10 件ずつ
  for (let i = 0; i < results.length; i += 10) await classifyWeights(env, results.slice(i, i + 10))
  return results.length
}
