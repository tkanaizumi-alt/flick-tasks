/**
 * ターン制バトル。乱数の種はサーバーだけが持ち、1 ターンごとに「行動の列」から状態を計算し直す
 * (先の乱数を知ってやり直すことはできない)。キャラの強さは始めたときのものを使う
 */
import type { Env } from './env'
import { ensureDaily, getPlayer, stageWin, type StageReward } from './game'
import { eventWin, takeEventTry, takeRematch } from './arena'
import { track } from './usage'
import { activeEvent, eventBoss, rematchGold } from '../shared/extras'
import { enemyForStage, equippedItems, jstDayStart, jstToday, type BattleStats, type Enemy, type PlayerState } from '../shared/game'
import { canAct, turnBattle, type TbState, type TurnAction } from '../shared/turn'

export type TurnKind = 'stage' | 'rematch' | 'event'
const KINDS: TurnKind[] = ['stage', 'rematch', 'event']

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0]
/** 戦闘に使うところだけ (装備は身につけているものだけ) */
const snapshotOf = (p: PlayerState): BattleStats => ({
  stats: p.stats,
  skills: p.skills,
  items: equippedItems(p),
  equipped: p.equipped,
  job: p.job,
  jobLevel: p.jobLevel,
  bonus: p.bonus,
})

interface Row {
  id: string
  user_id: string
  kind: TurnKind
  stage: number
  seed: number
  snapshot: string
  enemy: string
  actions: string
  status: string
}
const actionsOf = (r: Pick<Row, 'actions'>) => (r.actions ? (r.actions.split(',') as TurnAction[]) : [])
const stateOf = (r: Row) => turnBattle(JSON.parse(r.snapshot), JSON.parse(r.enemy), r.seed, actionsOf(r))

/** 続きのバトル (画面を開き直したとき用)。なければ null */
export async function activeTurn(env: Env, me: string) {
  const r = await env.DB.prepare("SELECT * FROM turn_battles WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(me).first<Row>()
  return r ? { id: r.id, kind: r.kind, state: stateOf(r) } : null
}

/** バトルを始める。回数の決まりはオートと同じ (始めた時点で 1 回と数える)。前の続きのバトルは負けとして終わる */
export async function startTurn(env: Env, me: string, kind: TurnKind, stage?: number) {
  if (!KINDS.includes(kind)) return { error: '知らないバトルです' }
  const db = env.DB
  const p = await getPlayer(db, me)
  let enemy: Enemy
  if (kind === 'stage') {
    enemy = enemyForStage(p.stage)
    const day = jstDayStart(Date.now())
    await ensureDaily(db, me, day)
    await db.prepare('UPDATE daily SET battles = battles + 1 WHERE user_id = ? AND day = ?').bind(me, day).run()
  } else if (kind === 'rematch') {
    if (!Number.isInteger(stage) || stage! < 1 || stage! >= p.stage) return { error: 'まだ倒していないボスです' }
    if (!(await takeRematch(db, me))) return { error: '再戦は今日はもうできません。また明日' }
    enemy = enemyForStage(stage!)
  } else {
    const ev = activeEvent(jstToday())
    if (!ev) return { error: '開催中のイベントはありません' }
    if (!(await takeEventTry(db, me, ev.id))) return { error: '今日の挑戦は終わりました。また明日' }
    enemy = eventBoss(ev, p.stage)
  }
  const id = crypto.randomUUID()
  const snap = snapshotOf(p)
  const sd = seed()
  await db.batch([
    db.prepare("UPDATE turn_battles SET status = 'abandoned' WHERE user_id = ? AND status = 'active'").bind(me),
    db
      .prepare('INSERT INTO turn_battles (id, user_id, kind, stage, seed, snapshot, enemy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, me, kind, kind === 'stage' ? p.stage : enemy.stage, sd, JSON.stringify(snap), JSON.stringify(enemy), Date.now()),
  ])
  return { id, kind, state: turnBattle(snap, enemy, sd, []) }
}

/** 1 ターン進める。終わったら報酬 (オートと同じ) */
export async function actTurn(env: Env, me: string, id: string, action: TurnAction) {
  const db = env.DB
  const row = await db.prepare('SELECT * FROM turn_battles WHERE id = ? AND user_id = ?').bind(id, me).first<Row>()
  if (!row) return { error: 'バトルが見つかりません' }
  if (row.status !== 'active') return { error: 'このバトルは終わっています' }
  const cur = stateOf(row)
  const bad = canAct(cur, action)
  if (bad) return { error: bad }
  const actions = [...actionsOf(row), action]
  const state = turnBattle(JSON.parse(row.snapshot), JSON.parse(row.enemy), row.seed, actions)
  // 行動の列が変わっていないときだけ進める (同時に押しても 1 ターンずつ)
  const upd = await db
    .prepare("UPDATE turn_battles SET actions = ?, status = ? WHERE id = ? AND actions = ? AND status = 'active'")
    .bind(actions.join(','), state.done ? 'done' : 'active', id, row.actions)
    .run()
  if (!upd.meta.changes) return { error: 'もう一度お試しください' }
  if (!state.done) return { state, reward: null }
  const reward = state.win ? await finish(env, me, row, state) : null
  return { state, reward, player: await getPlayer(db, me) }
}

/** 勝ったときの報酬。ステージのボスは、その間にステージが進んでいたら出さない (二重にならないように) */
async function finish(env: Env, me: string, row: Row, s: TbState): Promise<StageReward | null> {
  const db = env.DB
  const p = await getPlayer(db, me)
  let stmts: D1PreparedStatement[] = []
  let reward: StageReward | null = null
  if (row.kind === 'stage') {
    if (p.stage !== row.stage) return null
    const w = stageWin(db, me, p, s.enemy)
    stmts = w.stmts
    reward = w.reward
  } else if (row.kind === 'rematch') {
    const gold = rematchGold(row.stage)
    stmts = [db.prepare('UPDATE players SET gold = gold + ?, updated_at = ? WHERE user_id = ?').bind(gold, Date.now(), me)]
    reward = { gold, item: null }
  } else {
    const ev = activeEvent(jstToday())
    if (!ev) return null
    const w = eventWin(db, me, p, ev, s.enemy)
    stmts = w.stmts
    reward = w.reward
  }
  await db.batch([...stmts, track(db, me, 'turn_win', reward.gold)])
  return reward
}
