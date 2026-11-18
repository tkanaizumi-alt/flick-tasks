/**
 * ターン制バトル: 毎ターン、自分で行動を選ぶ (たたかう / 必殺技 / まもる / 回復薬)。
 * 敵はときどき「力をためて」次のターンに強攻撃をしてくるので、そこで守るのがコツ。
 * 乱数の種 (seed) と選んだ行動の列から、毎回はじめから計算し直す (サーバーとフロントで同じ結果になる純粋関数)
 */
import { MAX_TURNS, NO_BONUS, DEFAULT_JOB, effectiveStats, equippedItems, hasEffect, rng, setBonus, type BattleStats, type Enemy, type TurnLog } from './game'

export type TurnAction = 'attack' | 'skill' | 'guard' | 'heal'
/** 敵の行動: 攻撃 / 力をためる (攻撃しない) / 強攻撃 (ためた次のターン) */
export type EnemyMove = 'attack' | 'charge' | 'heavy'

export const TB_GAUGE_MAX = 100
/** 行動ごとに必殺技のゲージがたまる量 (攻撃を受けても少したまる) */
export const TB_GAIN: Record<TurnAction, number> = { attack: 20, skill: 0, guard: 30, heal: 10 }
export const TB_GAIN_HIT = 10
export const TB_SKILL_MULT = 1.8
export const TB_GUARD = 0.5
export const TB_POTIONS = 1
export const TB_POTION_HEAL = 0.25
export const TB_HEAVY_MULT = 2.8
/** 敵が力をためる確率 (2 ターン目から) */
export const TB_CHARGE_RATE = 0.3

export const TB_ACTIONS: { id: TurnAction; label: string; icon: string; desc: string }[] = [
  { id: 'attack', label: 'たたかう', icon: '⚔️', desc: 'ふつうの攻撃（スキル・装備の効果つき）' },
  { id: 'skill', label: '必殺技', icon: '💥', desc: `ゲージ満タンで攻撃×${TB_SKILL_MULT}` },
  { id: 'guard', label: 'まもる', icon: '🛡️', desc: `受けるダメージ-${Math.round((1 - TB_GUARD) * 100)}%・ゲージが多くたまる` },
  { id: 'heal', label: '回復薬', icon: '🧪', desc: `体力を${Math.round(TB_POTION_HEAL * 100)}%回復（1回のバトルで${TB_POTIONS}個）` },
]

export interface TbTurn extends TurnLog {
  action: TurnAction
  enemyMove: EnemyMove
  guarded: boolean
  potion: number // 回復薬で回復した量
  special: boolean // 必殺技を使った
}

export interface TbState {
  turns: TbTurn[]
  hp: number
  maxHp: number
  enemyHp: number
  enemy: Enemy
  gauge: number
  potions: number
  /** 次のターンの敵の行動 (画面に出す) */
  next: EnemyMove
  done: boolean
  win: boolean
}

/** 敵の行動の順番 (選んだ行動に左右されないよう、別の乱数で先に決める) */
export function enemyMoves(seed: number, n = MAX_TURNS): EnemyMove[] {
  const r = rng((seed ^ 0x9e3779b9) >>> 0)
  const out: EnemyMove[] = []
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1]
    out.push(prev === 'charge' ? 'heavy' : i >= 1 && prev !== 'heavy' && r() < TB_CHARGE_RATE ? 'charge' : 'attack')
  }
  return out
}

/** その行動が今できるか (できないときは理由) */
export function canAct(s: Pick<TbState, 'done' | 'gauge' | 'potions'>, a: TurnAction): string | null {
  if (s.done) return 'バトルは終わっています'
  if (!TB_ACTIONS.some((x) => x.id === a)) return '知らない行動です'
  if (a === 'skill' && s.gauge < TB_GAUGE_MAX) return 'ゲージが満タンになると使えます'
  if (a === 'heal' && s.potions <= 0) return '回復薬がありません'
  return null
}

/** seed と行動の列から、今の状態を計算する。できない行動は「たたかう」として扱う */
export function turnBattle(p: BattleStats, enemy: Enemy, seed: number, actions: TurnAction[]): TbState {
  const r = rng(seed)
  const moves = enemyMoves(seed)
  const s = effectiveStats(p)
  const job = p.job ?? DEFAULT_JOB
  const bonus = p.bonus ?? NO_BONUS
  const sb = setBonus(equippedItems(p))
  const has = (id: string) => hasEffect(p, id)
  const critMult = 2 + (has('critup') ? 0.5 : 0) + (has('critdmg') ? 0.5 : 0) + job.critDmg + bonus.critDmg + sb.critDmg
  let hp = s.hp
  let enemyHp = enemy.hp
  let gauge = 0
  let potions = TB_POTIONS
  let gutsUsed = false
  let phoenixUsed = false
  const turns: TbTurn[] = []

  const strike = (turn: number, first: boolean, scale = 1) => {
    const crit = r() * 100 < s.crit
    const smash = first && has('smash') && turn % 3 === 0
    let dmg = s.atk * (0.9 + r() * 0.2) * scale
    if (crit) dmg *= critMult
    if (smash) dmg *= 3
    if (turn === 1 && first && has('first')) dmg *= 2
    if (has('berserk') && hp <= s.hp / 2) dmg *= 1.5
    if (has('finisher') && enemyHp <= enemy.hp * 0.25) dmg *= 2
    dmg = Math.max(1, Math.round(dmg))
    enemyHp = Math.max(0, enemyHp - dmg)
    return { dmg, crit, smash }
  }

  const over = () => enemyHp <= 0 || hp <= 0 || turns.length >= MAX_TURNS
  for (const want of actions) {
    if (over()) break
    const turn = turns.length + 1
    const action: TurnAction = canAct({ done: false, gauge, potions }, want) ? 'attack' : want
    const move = moves[turn - 1]
    const log: TbTurn = { turn, hits: [], taken: 0, dodged: false, healed: 0, guts: false, revive: false, hp, enemyHp, action, enemyMove: move, guarded: action === 'guard', potion: 0, special: action === 'skill' }

    // 自分の行動
    let dealt = 0
    if (action === 'attack') {
      const swings = has('double') && r() < 0.25 ? 2 : 1
      for (let i = 0; i < swings && enemyHp > 0; i++) {
        const h = strike(turn, i === 0)
        log.hits.push(h)
        dealt += h.dmg
        if (h.crit && has('combo') && enemyHp > 0) {
          const c = strike(turn, false, 0.6)
          log.hits.push(c)
          dealt += c.dmg
        }
      }
    } else if (action === 'skill') {
      const h = strike(turn, true, TB_SKILL_MULT)
      log.hits.push(h)
      dealt += h.dmg
      gauge = 0
    } else if (action === 'heal') {
      potions--
      const before = hp
      hp = Math.min(s.hp, hp + Math.round(s.hp * TB_POTION_HEAL))
      log.potion = hp - before
    }
    gauge = Math.min(TB_GAUGE_MAX, gauge + TB_GAIN[action])
    if (has('lifesteal') && dealt > 0) {
      const before = hp
      hp = Math.min(s.hp, hp + Math.round(dealt * 0.1))
      log.healed += hp - before
    }

    // 敵の行動 (ためている間は攻撃しない)
    if (enemyHp > 0 && move !== 'charge') {
      if (has('dodge') && r() < 0.15) {
        log.dodged = true
      } else {
        let taken = enemy.atk * (0.9 + r() * 0.2) * job.guard * bonus.guard * sb.guard
        if (move === 'heavy') taken *= TB_HEAVY_MULT
        if (action === 'guard') taken *= TB_GUARD
        if (has('wall')) taken *= 0.8
        if (has('barrier') && turn <= 3) taken *= 0.5
        log.taken = Math.max(1, Math.round(taken))
        hp -= log.taken
        gauge = Math.min(TB_GAUGE_MAX, gauge + TB_GAIN_HIT)
        if (has('thorns')) enemyHp = Math.max(0, enemyHp - Math.round(log.taken * 0.3))
        if (has('counter')) enemyHp = Math.max(0, enemyHp - Math.round(log.taken * 0.25))
      }
      if (hp <= 0 && has('guts') && !gutsUsed) {
        hp = 1
        gutsUsed = true
        log.guts = true
      } else if (hp <= 0 && has('phoenix') && !phoenixUsed) {
        hp = Math.round(s.hp * 0.5)
        phoenixUsed = true
        log.revive = true
      }
    }
    // 毎ターンの回復
    if (hp > 0 && enemyHp > 0) {
      const heal = s.heal + (has('regen') ? Math.round(s.hp * 0.05) : 0)
      const before = hp
      hp = Math.min(s.hp, hp + heal)
      log.healed += hp - before
    }
    log.hp = Math.max(0, hp)
    log.enemyHp = enemyHp
    turns.push(log)
  }
  const done = over()
  return {
    turns,
    hp: Math.max(0, hp),
    maxHp: s.hp,
    enemyHp,
    enemy,
    gauge,
    potions,
    next: moves[Math.min(turns.length, moves.length - 1)],
    done,
    win: enemyHp <= 0,
  }
}

/** 目安の作戦 (テスト・勝率の目安用): 強攻撃は守る、体力が少なければ回復、ゲージ満タンで必殺技 */
export function simplePlan(s: TbState): TurnAction {
  if (s.next === 'heavy') return 'guard'
  if (s.hp < s.maxHp * 0.35 && s.potions > 0) return 'heal'
  if (s.gauge >= TB_GAUGE_MAX) return 'skill'
  return 'attack'
}

/** 作戦どおりに最後まで戦った結果 */
export function playOut(p: BattleStats, enemy: Enemy, seed: number, plan: (s: TbState) => TurnAction = simplePlan) {
  const actions: TurnAction[] = []
  let s = turnBattle(p, enemy, seed, actions)
  while (!s.done) {
    actions.push(plan(s))
    s = turnBattle(p, enemy, seed, actions)
  }
  return s
}
