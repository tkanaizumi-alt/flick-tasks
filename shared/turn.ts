/**
 * ターン制バトル: 毎ターン、自分で行動を選ぶ (たたかう / 職業のわざ / 必殺技 / まもる / 回復薬)。
 * 敵はときどき「力をためて」次のターンに強攻撃をしてくるので、そこで守るか、わざで止めるのがコツ。
 * 乱数の種 (seed) と選んだ行動の列から、毎回はじめから計算し直す (サーバーとフロントで同じ結果になる純粋関数)
 */
import { MAX_TURNS, NO_BONUS, DEFAULT_JOB, effectiveStats, effectValues, equippedItems, hasEffect, rng, setBonus, type BattleStats, type Enemy, type TurnLog } from './game'

/** 演出の種類 (画面のアニメーション) */
export type TbFx = 'slash' | 'double' | 'stab' | 'bash' | 'fire' | 'ice' | 'holy' | 'poison' | 'buff' | 'shield' | 'pray' | 'meteor' | 'shadow'

/** 職業のわざ。使うと cd ターンのあいだ使えない */
export interface TechDef {
  id: string
  name: string
  icon: string
  desc: string
  cd: number
  fx: TbFx
  /** 攻撃の倍率 (0 なら攻撃しない) と回数 */
  mult: number
  hits?: number
  /** 必ず会心 */
  crit?: boolean
  /** 敵の行動を止める確率 (このターン) */
  stun?: number
  /** 最大 HP に対する回復の割合 */
  heal?: number
  /** 必殺技のゲージ */
  gauge?: number
  /** 続く効果: 攻撃アップ / 受けるダメージダウン / 敵の攻撃ダウン / 毒・やけど (攻撃力に対する割合) */
  buff?: { kind: 'atk' | 'guard' | 'weaken' | 'dot'; turns: number; value: number }
}

export const TECHS: Record<string, TechDef> = Object.fromEntries(
  (
    [
      { id: 'twin', name: '二段斬り', icon: '⚔️', desc: '2回攻撃（各×0.6）', cd: 1, fx: 'double', mult: 0.6, hits: 2 },
      { id: 'rage', name: '闘気', icon: '🔥', desc: '攻撃×0.6。そのあと3ターン攻撃+25%', cd: 5, fx: 'buff', mult: 0.6, buff: { kind: 'atk', turns: 3, value: 0.25 } },
      { id: 'bash', name: '盾打ち', icon: '🛡️', desc: '攻撃×0.7。35%で敵の攻撃・ためを止める', cd: 3, fx: 'bash', mult: 0.7, stun: 0.35 },
      { id: 'fort', name: '守りの構え', icon: '🏰', desc: '攻撃×0.5。2ターン受けるダメージ-25%', cd: 4, fx: 'shield', mult: 0.5, buff: { kind: 'guard', turns: 2, value: 0.25 } },
      { id: 'stab', name: '急所突き', icon: '🗡️', desc: '攻撃×0.7。必ず会心', cd: 3, fx: 'stab', mult: 0.7, crit: true },
      { id: 'venom', name: '毒の刃', icon: '☠️', desc: '攻撃×0.5。3ターン毒（攻撃の25%）', cd: 4, fx: 'poison', mult: 0.5, buff: { kind: 'dot', turns: 3, value: 0.25 } },
      { id: 'pray', name: 'いのり', icon: '🙏', desc: '体力を15%回復・ゲージ+15', cd: 3, fx: 'pray', mult: 0, heal: 0.15, gauge: 15 },
      { id: 'smite', name: '聖なる光', icon: '✨', desc: '攻撃×0.9。2ターン敵の攻撃-20%', cd: 4, fx: 'holy', mult: 0.9, buff: { kind: 'weaken', turns: 2, value: 0.2 } },
      { id: 'fire', name: '火球', icon: '🔥', desc: '攻撃×1.1。2ターンやけど（攻撃の15%）', cd: 3, fx: 'fire', mult: 1.1, buff: { kind: 'dot', turns: 2, value: 0.15 } },
      { id: 'ice', name: '氷結', icon: '❄️', desc: '攻撃×0.6。60%で敵の攻撃・ためを止める（強攻撃は止められない）', cd: 4, fx: 'ice', mult: 0.6, stun: 0.6 },
      { id: 'brave', name: '勇気の剣', icon: '🌠', desc: '攻撃×1.2。体力を5%回復', cd: 3, fx: 'holy', mult: 1.2, heal: 0.05 },
    ] as TechDef[]
  ).map((t) => [t.id, t]),
)

/** 必殺技 (ゲージ満タンで使える)。職業ごとに違う */
export interface SpecialDef {
  id: string
  name: string
  icon: string
  desc: string
  fx: TbFx
  mult: number
  hits?: number
  crit?: boolean
  heal?: number
}
export const SPECIALS: Record<string, SpecialDef> = Object.fromEntries(
  (
    [
      { id: 'basic', name: '必殺技', icon: '💥', desc: '攻撃×1.8', fx: 'slash', mult: 1.8 },
      { id: 'sword', name: '剛剣・天割り', icon: '🗡️', desc: '攻撃×2', fx: 'slash', mult: 2 },
      { id: 'aegis', name: '聖盾の一撃', icon: '⚜️', desc: '攻撃×1.6・体力を10%回復', fx: 'holy', mult: 1.6, heal: 0.1 },
      { id: 'shadow', name: '影縫い', icon: '🌑', desc: '攻撃×1.1・必ず会心', fx: 'shadow', mult: 1.1, crit: true },
      { id: 'bless', name: '大いなる祝福', icon: '🌈', desc: '攻撃×1.2・体力を20%回復', fx: 'pray', mult: 1.2, heal: 0.2 },
      { id: 'meteor', name: '星降り', icon: '☄️', desc: '3回攻撃（各×0.7）', fx: 'meteor', mult: 0.7, hits: 3 },
      { id: 'hero', name: '天翔ける剣', icon: '🌠', desc: '攻撃×2・体力を10%回復', fx: 'meteor', mult: 2, heal: 0.1 },
    ] as SpecialDef[]
  ).map((t) => [t.id, t]),
)

/** 基本の行動 (わざ・必殺技の ID も行動として使う) */
export type BaseAction = 'attack' | 'skill' | 'guard' | 'heal'
export type TurnAction = BaseAction | (string & {})
/** 敵の行動: 攻撃 / 力をためる (攻撃しない) / 強攻撃 (ためた次のターン) */
export type EnemyMove = 'attack' | 'charge' | 'heavy'

export const TB_GAUGE_MAX = 100
/** 行動ごとに必殺技のゲージがたまる量 (攻撃を受けても少したまる) */
export const TB_GAIN: Record<BaseAction | 'tech', number> = { attack: 20, skill: 0, guard: 30, heal: 10, tech: 15 }
export const TB_GAIN_HIT = 10
export const TB_GUARD = 0.5
export const TB_POTIONS = 1
export const TB_POTION_HEAL = 0.25
export const TB_HEAVY_MULT = 2.8
/** 敵が力をためる確率 (2 ターン目から) */
export const TB_CHARGE_RATE = 0.3

export const TB_ACTIONS: { id: BaseAction; label: string; icon: string; desc: string }[] = [
  { id: 'attack', label: 'たたかう', icon: '⚔️', desc: 'ふつうの攻撃（スキル・装備の効果つき）' },
  { id: 'skill', label: '必殺技', icon: '💥', desc: 'ゲージ満タンで使える職業の大技' },
  { id: 'guard', label: 'まもる', icon: '🛡️', desc: `受けるダメージ-${Math.round((1 - TB_GUARD) * 100)}%・ゲージが多くたまる` },
  { id: 'heal', label: '回復薬', icon: '🧪', desc: `体力を${Math.round(TB_POTION_HEAL * 100)}%回復（1回のバトルで${TB_POTIONS}個）` },
]

/** 職業のわざと必殺技 (職業の定義に無ければ基本の必殺技だけ) */
export const jobTechs = (p: BattleStats) => (p.job?.techs ?? []).filter((t) => TECHS[t])
export const jobSpecial = (p: BattleStats) => SPECIALS[p.job?.special ?? ''] ?? SPECIALS.basic

/** 続いている効果 (残りターン) */
export interface TbStatus {
  atk: number
  atkValue: number
  guard: number
  guardValue: number
  weaken: number
  weakenValue: number
  dot: number
  dotDmg: number
}
const NO_STATUS: TbStatus = { atk: 0, atkValue: 0, guard: 0, guardValue: 0, weaken: 0, weakenValue: 0, dot: 0, dotDmg: 0 }

export interface TbTurn extends TurnLog {
  action: TurnAction
  enemyMove: EnemyMove
  guarded: boolean
  potion: number // 回復薬・わざで回復した量
  special: boolean // 必殺技を使った
  /** 使ったわざ・必殺技の ID と演出 */
  tech?: string
  fx?: TbFx
  /** 敵の行動を止めた */
  stunned?: boolean
  /** 毒・やけどのダメージ */
  dot?: number
}

export interface TbState {
  turns: TbTurn[]
  hp: number
  maxHp: number
  enemyHp: number
  enemy: Enemy
  gauge: number
  potions: number
  /** 使えるわざと、使えるようになるまでのターン */
  techs: string[]
  cd: Record<string, number>
  special: string
  status: TbStatus
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
export function canAct(s: Pick<TbState, 'done' | 'gauge' | 'potions'> & Partial<Pick<TbState, 'techs' | 'cd'>>, a: TurnAction): string | null {
  if (s.done) return 'バトルは終わっています'
  if (TECHS[a]) {
    if (!(s.techs ?? []).includes(a)) return 'この職業では使えません'
    const left = s.cd?.[a] ?? 0
    return left > 0 ? `あと${left}ターンで使えます` : null
  }
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
  const fx = effectValues(p)
  const critMult = 2 + (has('critup') ? 0.5 : 0) + (fx.critdmg ?? 0) + job.critDmg + bonus.critDmg + sb.critDmg
  const techs = jobTechs(p)
  const special = jobSpecial(p)
  const cd: Record<string, number> = {}
  const st: TbStatus = { ...NO_STATUS }
  let hp = s.hp
  let enemyHp = enemy.hp
  let gauge = 0
  let potions = TB_POTIONS
  let gutsUsed = false
  let phoenixUsed = false
  const turns: TbTurn[] = []

  const strike = (turn: number, first: boolean, scale = 1, sureCrit = false) => {
    const roll = r() * 100 < s.crit
    const crit = sureCrit || roll
    const smash = first && has('smash') && turn % 3 === 0
    let dmg = s.atk * (0.9 + r() * 0.2) * scale * (st.atk > 0 ? 1 + st.atkValue : 1)
    if (crit) dmg *= critMult
    if (smash) dmg *= 3
    if (turn === 1 && first && fx.first) dmg *= fx.first
    if (has('berserk') && hp <= s.hp / 2) dmg *= 1.5
    if (has('finisher') && enemyHp <= enemy.hp * 0.25) dmg *= 2
    dmg = Math.max(1, Math.round(dmg))
    enemyHp = Math.max(0, enemyHp - dmg)
    return { dmg, crit, smash }
  }
  const restore = (ratio: number) => {
    const before = hp
    hp = Math.min(s.hp, hp + Math.round(s.hp * ratio))
    return hp - before
  }

  const over = () => enemyHp <= 0 || hp <= 0 || turns.length >= MAX_TURNS
  for (const want of actions) {
    if (over()) break
    const turn = turns.length + 1
    const action: TurnAction = canAct({ done: false, gauge, potions, techs, cd }, want) ? 'attack' : want
    const move = moves[turn - 1]
    const tech = TECHS[action]
    const log: TbTurn = { turn, hits: [], taken: 0, dodged: false, healed: 0, guts: false, revive: false, hp, enemyHp, action, enemyMove: move, guarded: action === 'guard', potion: 0, special: action === 'skill' }

    // 自分の行動
    let dealt = 0
    const hitN = (n: number, scale: number, sure = false) => {
      for (let i = 0; i < n && enemyHp > 0; i++) {
        const h = strike(turn, i === 0, scale, sure)
        log.hits.push(h)
        dealt += h.dmg
      }
    }
    let stun = false
    if (action === 'attack') {
      const swings = fx.double && r() < fx.double ? 2 : 1
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
      log.fx = 'slash'
    } else if (action === 'skill') {
      hitN(special.hits ?? 1, special.mult, special.crit)
      if (special.heal) log.potion += restore(special.heal)
      log.tech = special.id
      log.fx = special.fx
      gauge = 0
    } else if (tech) {
      if (tech.mult > 0) hitN(tech.hits ?? 1, tech.mult, tech.crit)
      if (tech.heal) log.potion += restore(tech.heal)
      if (tech.gauge) gauge = Math.min(TB_GAUGE_MAX, gauge + tech.gauge)
      if (tech.stun) stun = tech.stun >= 1 || r() < tech.stun
      const b = tech.buff
      // 続く効果は、このターンの終わりに 1 減るので +1 しておく (攻撃アップだけは次のターンから)
      if (b?.kind === 'atk') ((st.atk = b.turns + 1), (st.atkValue = b.value))
      if (b?.kind === 'guard') ((st.guard = b.turns), (st.guardValue = b.value))
      if (b?.kind === 'weaken') ((st.weaken = b.turns), (st.weakenValue = b.value))
      if (b?.kind === 'dot') ((st.dotDmg = Math.max(st.dot > 0 ? st.dotDmg : 0, Math.round(s.atk * b.value))), (st.dot = b.turns))
      cd[tech.id] = tech.cd + 1
      log.tech = tech.id
      log.fx = tech.fx
    } else if (action === 'heal') {
      potions--
      log.potion = restore(TB_POTION_HEAL)
    }
    gauge = Math.min(TB_GAUGE_MAX, gauge + (tech ? TB_GAIN.tech : TB_GAIN[action as BaseAction]))
    if (fx.lifesteal && dealt > 0) {
      const before = hp
      hp = Math.min(s.hp, hp + Math.round(dealt * fx.lifesteal))
      log.healed += hp - before
    }

    // 敵の行動 (ためている間は攻撃しない)。止めたらこのターンは何もしない。
    // 強攻撃は止められないが、ためているところを止めると次の強攻撃はふつうの攻撃になる
    if (enemyHp > 0 && stun && move === 'attack') log.stunned = true
    if (enemyHp > 0 && stun && move === 'charge') {
      log.stunned = true
      if (moves[turn] === 'heavy') moves[turn] = 'attack'
    }
    if (enemyHp > 0 && move !== 'charge' && !log.stunned) {
      if (fx.dodge && r() < fx.dodge) {
        log.dodged = true
      } else {
        let taken = enemy.atk * (0.9 + r() * 0.2) * job.guard * bonus.guard * sb.guard
        if (move === 'heavy') taken *= TB_HEAVY_MULT
        if (action === 'guard') taken *= TB_GUARD
        if (st.guard > 0) taken *= 1 - st.guardValue
        if (st.weaken > 0) taken *= 1 - st.weakenValue
        if (fx.wall) taken *= 1 - fx.wall
        if (has('barrier') && turn <= 3) taken *= 0.5
        log.taken = Math.max(1, Math.round(taken))
        hp -= log.taken
        gauge = Math.min(TB_GAUGE_MAX, gauge + TB_GAIN_HIT)
        if (fx.thorns) enemyHp = Math.max(0, enemyHp - Math.round(log.taken * fx.thorns))
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
    // 毒・やけど
    if (st.dot > 0 && enemyHp > 0 && hp > 0) {
      log.dot = Math.min(enemyHp, st.dotDmg)
      enemyHp -= log.dot
    }
    // 毎ターンの回復
    if (hp > 0 && enemyHp > 0) {
      const heal = s.heal + (fx.regen ? Math.round(s.hp * fx.regen) : 0)
      const before = hp
      hp = Math.min(s.hp, hp + heal)
      log.healed += hp - before
    }
    // 続く効果とわざの待ち時間を 1 ターン進める
    for (const k of ['atk', 'guard', 'weaken', 'dot'] as const) st[k] = Math.max(0, st[k] - 1)
    for (const k of Object.keys(cd)) cd[k] = Math.max(0, cd[k] - 1)
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
    techs,
    cd: { ...cd },
    special: special.id,
    status: { ...st },
    next: moves[Math.min(turns.length, moves.length - 1)],
    done,
    win: enemyHp <= 0,
  }
}

/** 目安の作戦 (テスト・勝率の目安用): ためを止められるなら止める、強攻撃は守る、体力が少なければ回復、ゲージ満タンで必殺技、使えるわざは使う */
export function simplePlan(s: TbState): TurnAction {
  const ready = (id: string) => !canAct(s, id)
  if (s.next === 'charge') {
    const stopper = s.techs.find((t) => (TECHS[t].stun ?? 0) >= 0.5 && ready(t))
    if (stopper) return stopper
  }
  if (s.next === 'heavy') return s.techs.includes('fort') && ready('fort') ? 'fort' : 'guard'
  if (s.hp < s.maxHp * 0.35) {
    if (s.potions > 0) return 'heal'
    const h = s.techs.find((t) => TECHS[t].heal && ready(t))
    if (h) return h
  }
  if (s.gauge >= TB_GAUGE_MAX) return 'skill'
  const t = s.techs.find((id) => ready(id) && !(TECHS[id].heal && !TECHS[id].mult && s.hp > s.maxHp * 0.7))
  return t ?? 'attack'
}

/** たたかうだけ・まもるだけの、わざを使わない作戦 (くらべる用) */
export function plainPlan(s: TbState): TurnAction {
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
