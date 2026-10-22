import type { Env } from './env'
import {
  canLearn,
  computeXp,
  enemyForStage,
  jstDayStart,
  levelInfo,
  simulateBattle,
  spInfo,
  STATS,
  type PlayerState,
  type StatKey,
  type Weight,
} from '../shared/game'

const STAT_COL: Record<StatKey, string> = { atk: 'stat_atk', hp: 'stat_hp', crit: 'stat_crit', heal: 'stat_heal' }

export async function getPlayer(db: D1Database, userId: string): Promise<PlayerState> {
  await db.prepare('INSERT OR IGNORE INTO players (user_id, updated_at) VALUES (?, ?)').bind(userId, Date.now()).run()
  const [row, skills] = await db.batch([
    db.prepare('SELECT * FROM players WHERE user_id = ?').bind(userId),
    db.prepare('SELECT skill_id FROM player_skills WHERE user_id = ?').bind(userId),
  ])
  const r = row.results[0] as any
  return {
    xp: r.xp,
    stats: { atk: r.stat_atk, hp: r.stat_hp, crit: r.stat_crit, heal: r.stat_heal },
    skills: (skills.results as any[]).map((s) => s.skill_id),
    stage: r.stage,
    resets: r.resets,
  }
}

export const logActivity = (db: D1Database, userId: string, kind: string, text: string) =>
  db.prepare('INSERT INTO activity (user_id, kind, text, created_at) VALUES (?, ?, ?, ?)').bind(userId, kind, text, Date.now())

export interface XpChange {
  amount: number
  bonuses: string[]
  level: number
  leveledUp: boolean
}

/** タスクのステータス変化に応じて XP を付与・取り消しする。PATCH の更新前のタスク行を受け取る */
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
    const { amount, bonuses } = computeXp({
      weight: before.weight as Weight | null,
      createdAt: before.created_at,
      now,
      doneToday: today?.n ?? 0,
      source: before.source,
      skills: player.skills,
    })
    const level = levelInfo(player.xp + amount).level
    const stmts = [
      db.prepare('UPDATE players SET xp = xp + ?, updated_at = ? WHERE user_id = ?').bind(amount, now, userId),
      db.prepare('UPDATE tasks SET xp_awarded = ?, done_at = ? WHERE id = ?').bind(amount, now, before.id),
      logActivity(db, userId, 'done', before.title),
    ]
    if (level > prevLevel) stmts.push(logActivity(db, userId, 'levelup', `Lv${level}`))
    await db.batch(stmts)
    return { amount, bonuses, level, leveledUp: level > prevLevel }
  }

  // 完了から戻した: 付与済み XP を取り消す
  const amount = before.xp_awarded ?? 0
  await db.batch([
    db.prepare('UPDATE players SET xp = MAX(0, xp - ?), updated_at = ? WHERE user_id = ?').bind(amount, now, userId),
    db.prepare('UPDATE tasks SET xp_awarded = 0, done_at = NULL WHERE id = ?').bind(before.id),
  ])
  return { amount: -amount, bonuses: [], level: levelInfo(Math.max(0, player.xp - amount)).level, leveledUp: false }
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

/** 現在のステージのボスに挑む。勝てば次のステージへ進み、リセットの書を 1 冊得る */
export async function fight(db: D1Database, userId: string) {
  const p = await getPlayer(db, userId)
  const enemy = enemyForStage(p.stage)
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]
  const result = simulateBattle(p, enemy, seed)
  if (result.win) {
    await db.batch([
      db.prepare('UPDATE players SET stage = stage + 1, resets = resets + 1, updated_at = ? WHERE user_id = ?').bind(Date.now(), userId),
      logActivity(db, userId, 'boss', `${enemy.icon} ${enemy.name}`),
    ])
  }
  return { result, player: await getPlayer(db, userId) }
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
