import type { Env } from './env'
import { JOB_MAP, JOB_UNLOCK_LEVEL, advancedOf, unlockedJobs } from './jobs'
import { SECRET_MAP, bonusOf, visibleSecrets } from './secrets'
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
})

export async function getPlayer(db: D1Database, userId: string): Promise<PlayerState> {
  await db.prepare('INSERT OR IGNORE INTO players (user_id, updated_at) VALUES (?, ?)').bind(userId, Date.now()).run()
  const [row, skills, items, jobRows] = await db.batch([
    db.prepare('SELECT * FROM players WHERE user_id = ?').bind(userId),
    db.prepare('SELECT skill_id FROM player_skills WHERE user_id = ?').bind(userId),
    db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC').bind(userId),
    db.prepare('SELECT job_id, xp FROM player_jobs WHERE user_id = ?').bind(userId),
  ])
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
    skin: r.skin && SKIN_MAP[r.skin] ? r.skin : null,
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
      db.prepare('UPDATE players SET xp = xp + ?, gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(amount, gold, now, userId),
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

/** スキンの変更 (null で Google の写真に戻す)。解放済みのものだけ */
export async function setSkin(db: D1Database, userId: string, skin: string | null) {
  const p = await getPlayer(db, userId)
  if (skin !== null) {
    const def = SKIN_MAP[skin]
    if (!def) return { error: '存在しないスキン' }
    if (!skinUnlocked(def, levelInfo(p.xp).level, p.stage)) return { error: 'まだ解放されていません' }
  }
  await db.prepare('UPDATE players SET skin = ?, updated_at = ? WHERE user_id = ?').bind(skin, Date.now(), userId).run()
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

/** SR 以上を引いたらみんなの「最近の動き」に流す */
const itemActivity = (db: D1Database, userId: string, item: Item) =>
  item.rarity === 'SSR' || item.rarity === 'SR' ? [logActivity(db, userId, 'item', `${item.rarity} ${item.name}`)] : []

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
    if (p.items.length < INVENTORY_MAX) {
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
  if (p.items.length >= INVENTORY_MAX) return { error: '持ち物がいっぱいです' }
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
  if (m.chest && p.items.length < INVENTORY_MAX) {
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
  ])
  return res.meta.changes ?? 0
}

/** アプリ内通知を作る (自分宛てには作らない) */
export const notify = (db: D1Database, userId: string, actorId: string, kind: string, taskId: string | null, text: string) =>
  db
    .prepare('INSERT INTO notifications (user_id, actor_id, kind, task_id, text, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE ? <> ?')
    .bind(userId, actorId, kind, taskId, text, Date.now(), userId, actorId)

// ---------- AI によるタスクの重さ判定 ----------
const WEIGHT_PROMPT = `各タスクの作業量を S(15分以内) / M(1〜2時間) / L(半日以上・複数工程) / XL(数日〜数週間かかるプロジェクト級) で判定してください。
XL はめったに使いません。明らかに数日以上かかる大型案件だけに付け、迷ったら L にしてください。
入力は「番号: タスク」の行です。JSON {"weights": ["S"|"M"|"L"|"XL", ...]} を入力と同じ順で返してください。`

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
    const stmts = tasks
      .map((t, i) => (['S', 'M', 'L', 'XL'].includes(weights[i]) ? env.DB.prepare('UPDATE tasks SET weight = ? WHERE id = ? AND weight IS NULL').bind(weights[i], t.id) : null))
      .filter((s): s is D1PreparedStatement => !!s)
    if (stmts.length) await env.DB.batch(stmts)
  } catch (e) {
    // 判定できなければ M 扱い (XP 計算側の既定値)
    console.error('weight classify failed', e)
  }
}
