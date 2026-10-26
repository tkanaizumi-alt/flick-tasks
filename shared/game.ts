// ゲームのルール。サーバー (実際の判定) とフロント (勝率の目安表示) の両方で使う純粋関数のみ。
// 上位職の定義はサーバー側 (worker/jobs.ts) だけに置き、解放されたものだけをプレイヤー状態に含めて返す

export type StatKey = 'atk' | 'hp' | 'crit' | 'heal'
export type Weight = 'S' | 'M' | 'L'
export type Branch = 'warrior' | 'guardian' | 'sage'
export type Slot = 'head' | 'body' | 'feet' | 'weapon'
export type Rarity = 'N' | 'R' | 'SR' | 'SSR'

export interface Item {
  id: string
  slot: Slot
  name: string
  icon: string
  rarity: Rarity
  atk: number
  hp: number
  crit: number
  heal: number
  effect: string | null
}

/** 冒険職。倍率は最終ステータスにかかる */
export interface JobDef {
  id: string
  name: string
  icon: string
  desc: string
  tier: 1 | 2
  atk: number // 攻撃の倍率
  hp: number // 体力の倍率
  crit: number // 会心率 (加算 %)
  heal: number // 回復の倍率
  healAdd: number // 毎ターン回復 (加算)
  guard: number // 受けるダメージの倍率
  critDmg: number // 会心ダメージ倍率 (加算)
}

export interface JobProgress {
  id: string
  name: string
  icon: string
  desc: string
  tier: 1 | 2
  xp: number
  level: number
  current: number
  next: number
  max: boolean
}

export interface PlayerState {
  xp: number
  stats: Record<StatKey, number> // 振り分けたポイント数
  skills: string[]
  stage: number // 次に挑むステージ (1 始まり)
  gold: number
  items: Item[]
  equipped: Partial<Record<Slot, string>> // スロット → 装備中のアイテム ID
  job: JobDef
  jobLevel: number
  jobs: JobProgress[] // 選べる職業 (未解放の上位職は含まない)
  secretSkills: SecretSkillView[] // 解放済みの隠しスキル (条件を満たしたものだけ)
  bonus: Bonus // 習得済みの隠しスキルの効果の合計
  skin?: string | null // 見た目 (null = Google の写真)
}

/** 隠しスキルの効果。中身 (名前・条件) はサーバーだけが知っていて、フロントには数値だけが届く */
export interface Bonus {
  atk: number // 攻撃の倍率
  hp: number // 体力の倍率
  crit: number // 会心率 (加算)
  critDmg: number // 会心ダメージ (加算)
  heal: number // 毎ターン回復 (加算)
  guard: number // 受けるダメージの倍率
  xp: number // タスク XP (加算倍率)
  gold: number // タスクのゴールド (加算倍率)
  effects: string[] // 戦闘効果 (装備の効果と同じ ID)
}
export const NO_BONUS: Bonus = { atk: 1, hp: 1, crit: 0, critDmg: 0, heal: 0, guard: 1, xp: 0, gold: 0, effects: [] }

export interface SecretSkillView {
  id: string
  name: string
  desc: string
  cost: number
  combo: string // 例: 「集中 × 結界」
  owned: boolean
}

type BattleStats = Pick<PlayerState, 'stats' | 'skills'> &
  Partial<Pick<PlayerState, 'items' | 'equipped' | 'job' | 'jobLevel' | 'bonus'>>

// ---------- 冒険職 (基本職) ----------
export const BASE_JOBS: JobDef[] = [
  { id: 'warrior', name: '戦士', icon: '⚔️', desc: '攻撃と体力のバランスが良い', tier: 1, atk: 1.15, hp: 1.1, crit: 0, heal: 1, healAdd: 0, guard: 1, critDmg: 0 },
  { id: 'knight', name: '騎士', icon: '🛡️', desc: '体力が高く、受けるダメージ-15%', tier: 1, atk: 1, hp: 1.4, crit: 0, heal: 1, healAdd: 0, guard: 0.85, critDmg: 0 },
  { id: 'thief', name: '盗賊', icon: '🗡️', desc: '会心率+15%、会心ダメージ+30%', tier: 1, atk: 1.05, hp: 0.95, crit: 15, heal: 1, healAdd: 0, guard: 1, critDmg: 0.3 },
  { id: 'cleric', name: '僧侶', icon: '✨', desc: '毎ターンの回復が大きい', tier: 1, atk: 0.95, hp: 1.15, crit: 0, heal: 2, healAdd: 3, guard: 1, critDmg: 0 },
  { id: 'mage', name: '魔法使い', icon: '🪄', desc: '攻撃力がとても高いが打たれ弱い', tier: 1, atk: 1.45, hp: 0.8, crit: 5, heal: 1, healAdd: 0, guard: 1, critDmg: 0 },
]
export const DEFAULT_JOB = BASE_JOBS[0]

/** 職業レベル: その職業で獲得した XP で上がる */
export const jobXpForNext = (level: number) => 30 + (level - 1) * 15
export const JOB_LEVEL_MAX = 30
export function jobLevelInfo(xp: number) {
  let level = 1
  let rest = Math.max(0, xp)
  while (level < JOB_LEVEL_MAX && rest >= jobXpForNext(level)) {
    rest -= jobXpForNext(level)
    level++
  }
  // 上限ではバーを満タンにする
  if (level >= JOB_LEVEL_MAX) return { level, current: 1, next: 1, max: true }
  return { level, current: rest, next: jobXpForNext(level), max: false }
}
/** 熟練度: 今の職業のレベル 1 ごとに攻撃・体力 +1%。MAX (Lv30) で +30% */
export const masteryBonus = (jobLevel: number) => (jobLevel >= JOB_LEVEL_MAX ? 30 : Math.max(0, jobLevel - 1)) / 100

// ---------- レベル ----------
export const SP_PER_LEVEL = 3
/** level → level+1 に必要な XP */
export const xpForNext = (level: number) => 40 + (level - 1) * 20

export function levelInfo(xp: number) {
  let level = 1
  let rest = Math.max(0, xp)
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level)
    level++
  }
  return { level, current: rest, next: xpForNext(level) }
}

export function spInfo(p: Pick<PlayerState, 'xp' | 'stats' | 'skills'> & Partial<Pick<PlayerState, 'secretSkills'>>) {
  const { level } = levelInfo(p.xp)
  const total = (level - 1) * SP_PER_LEVEL
  const spentStats = Object.values(p.stats).reduce((a, b) => a + b, 0)
  const secretCost = (id: string) => p.secretSkills?.find((s) => s.id === id)?.cost ?? 0
  const spentSkills = p.skills.reduce((a, id) => a + (SKILL_MAP[id]?.cost ?? secretCost(id)), 0)
  return { total, spent: spentStats + spentSkills, free: total - spentStats - spentSkills }
}

// ---------- ステータス ----------
export const STATS: { key: StatKey; label: string; unit: string; per: number; base: number }[] = [
  { key: 'atk', label: '攻撃', unit: '', per: 2, base: 6 },
  { key: 'hp', label: '体力', unit: '', per: 10, base: 50 },
  { key: 'crit', label: '会心', unit: '%', per: 2, base: 5 },
  { key: 'heal', label: '回復', unit: '/ターン', per: 2, base: 0 },
]

export function equippedItems(p: Partial<Pick<PlayerState, 'items' | 'equipped'>>): Item[] {
  const ids = Object.values(p.equipped ?? {})
  return (p.items ?? []).filter((i) => ids.includes(i.id))
}

/** スキルと装備の効果をまとめて判定 */
export function hasEffect(p: BattleStats, id: string) {
  return p.skills.includes(id) || equippedItems(p).some((i) => i.effect === id) || !!p.bonus?.effects.includes(id)
}

export const CRIT_CAP = 75

export function effectiveStats(p: BattleStats) {
  const gear = equippedItems(p)
  const job = p.job ?? DEFAULT_JOB
  const m = 1 + masteryBonus(p.jobLevel ?? 1)
  const raw = (k: StatKey) => {
    const s = STATS.find((x) => x.key === k)!
    return s.base + s.per * (p.stats[k] ?? 0) + gear.reduce((a, i) => a + i[k], 0)
  }
  const b = p.bonus ?? NO_BONUS
  return {
    atk: Math.round(raw('atk') * job.atk * m * b.atk),
    hp: Math.round(raw('hp') * job.hp * m * b.hp),
    crit: Math.min(CRIT_CAP, raw('crit') + job.crit + b.crit),
    heal: Math.round(raw('heal') * job.heal + job.healAdd + b.heal),
  }
}

// ---------- スキル ----------
export interface Skill {
  id: string
  branch: Branch
  name: string
  desc: string
  cost: number
  requires?: string
}

export const BRANCHES: { key: Branch; label: string; icon: string }[] = [
  { key: 'warrior', label: '攻撃', icon: '⚔️' },
  { key: 'guardian', label: '守護', icon: '🛡️' },
  { key: 'sage', label: '知恵', icon: '📜' },
]

export const SKILLS: Skill[] = [
  { id: 'double', branch: 'warrior', name: '連撃', desc: '25%の確率で2回攻撃', cost: 2 },
  { id: 'smash', branch: 'warrior', name: '渾身の一撃', desc: '3ターンごとに攻撃×3', cost: 3, requires: 'double' },
  { id: 'critup', branch: 'warrior', name: '会心強化', desc: '会心ダメージ+50%', cost: 4, requires: 'smash' },
  { id: 'berserk', branch: 'warrior', name: '背水の陣', desc: 'HPが半分以下で攻撃×1.5', cost: 4, requires: 'critup' },
  { id: 'combo', branch: 'warrior', name: '追撃', desc: '会心のとき、もう一度攻撃 (60%)', cost: 5, requires: 'berserk' },
  { id: 'finisher', branch: 'warrior', name: 'とどめ', desc: '敵のHPが25%以下でダメージ×2', cost: 6, requires: 'combo' },
  { id: 'wall', branch: 'guardian', name: '鉄壁', desc: '受けるダメージ-20%', cost: 2 },
  { id: 'regen', branch: 'guardian', name: '自己再生', desc: '毎ターン最大HPの5%回復', cost: 3, requires: 'wall' },
  { id: 'guts', branch: 'guardian', name: '不屈', desc: '1度だけHP1で踏みとどまる', cost: 4, requires: 'regen' },
  { id: 'counter', branch: 'guardian', name: 'カウンター', desc: '受けたダメージの25%を返す', cost: 4, requires: 'guts' },
  { id: 'barrier', branch: 'guardian', name: '結界', desc: '最初の3ターン、受けるダメージ-50%', cost: 5, requires: 'counter' },
  { id: 'phoenix', branch: 'guardian', name: '不死鳥', desc: '1度だけHP50%で復活', cost: 6, requires: 'barrier' },
  { id: 'early', branch: 'sage', name: '早起きの加護', desc: '朝9時までの完了でXP+20%', cost: 2 },
  { id: 'focus', branch: 'sage', name: '集中', desc: '1日5件目以降の完了でXP+30%', cost: 3, requires: 'early' },
  { id: 'ai', branch: 'sage', name: '分解の達人', desc: 'AIで作ったタスクのXP+10%', cost: 2, requires: 'early' },
  { id: 'streak', branch: 'sage', name: '継続は力', desc: '前日も完了していればXP+15%', cost: 3, requires: 'focus' },
  { id: 'goldsmith', branch: 'sage', name: '錬金術', desc: 'タスクのゴールド+30%', cost: 4, requires: 'ai' },
  { id: 'scholar', branch: 'sage', name: '博識', desc: 'タスクのXP+15%', cost: 6, requires: 'streak' },
]
export const SKILL_MAP: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]))

export function canLearn(p: Pick<PlayerState, 'xp' | 'stats' | 'skills'>, id: string): string | null {
  const s = SKILL_MAP[id]
  if (!s) return '存在しないスキル'
  if (p.skills.includes(id)) return '習得済み'
  if (s.requires && !p.skills.includes(s.requires)) return `「${SKILL_MAP[s.requires].name}」が必要`
  if (spInfo(p).free < s.cost) return 'SPが足りません'
  return null
}

// ---------- 敵 ----------
export interface Enemy {
  stage: number
  name: string
  icon: string
  hp: number
  atk: number
}

export const MAIN_STAGES = 30
/** 10 ステージごとに章が変わる。10・20・30 は章ボス */
const BOSS_NAMES: [string, string][] = [
  ['スライム', '💧'], ['ゴブリン', '👺'], ['オオカミ', '🐺'], ['ゴーレム', '🗿'], ['魔術師', '🧙'],
  ['ワイバーン', '🦅'], ['騎士団長', '🤺'], ['ドラゴン', '🐲'], ['堕天使', '👼'], ['魔王', '😈'],
  ['キノコ王', '🍄'], ['大ダコ', '🐙'], ['サソリ王', '🦂'], ['雪男', '☃️'], ['吸血鬼', '🧛'],
  ['ゾンビ将軍', '🧟'], ['一つ目巨人', '👁️'], ['クラーケン', '🦑'], ['雷神', '🌩️'], ['冥王', '💀'],
  ['機械兵', '🤖'], ['炎の精霊', '🔥'], ['氷の女王', '🧊'], ['大樹の番人', '🌳'], ['海竜', '🐉'],
  ['宇宙人', '👽'], ['時の番人', '⌛'], ['影の王', '🌑'], ['星の巨人', '🌠'], ['終焉の竜', '🌋'],
]

/** ボスの強さ。序盤はすぐ勝て、章が進むほど伸びる */
export const bossHp = (n: number) => Math.round(30 * Math.pow(n, 1.75))
export const bossAtk = (n: number) => Math.round(4 * Math.pow(n, 1.25))

export function enemyForStage(stage: number): Enemy {
  if (stage <= MAIN_STAGES) {
    const [name, icon] = BOSS_NAMES[stage - 1]
    return { stage, name, icon, hp: bossHp(stage), atk: bossAtk(stage) }
  }
  // 終焉の竜の先は無限の塔。1 階ごとに強くなる
  const floor = stage - MAIN_STAGES
  return {
    stage,
    name: `無限の塔 ${floor}階`,
    icon: '🗼',
    hp: Math.round(bossHp(MAIN_STAGES) * Math.pow(1.12, floor)),
    atk: Math.round(bossAtk(MAIN_STAGES) * Math.pow(1.08, floor)),
  }
}

// ---------- 戦闘 ----------
export interface TurnLog {
  turn: number
  hits: { dmg: number; crit: boolean; smash: boolean }[]
  taken: number
  dodged: boolean
  healed: number
  guts: boolean
  revive: boolean
  hp: number
  enemyHp: number
}
export interface BattleResult {
  win: boolean
  turns: TurnLog[]
  maxHp: number
  enemy: Enemy
}

/** 再現可能な乱数 (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MAX_TURNS = 30

export function simulateBattle(p: BattleStats, enemy: Enemy, seed: number): BattleResult {
  const r = rng(seed)
  const s = effectiveStats(p)
  const job = p.job ?? DEFAULT_JOB
  const has = (id: string) => hasEffect(p, id)
  const bonus = p.bonus ?? NO_BONUS
  const critMult = 2 + (has('critup') ? 0.5 : 0) + (has('critdmg') ? 0.5 : 0) + job.critDmg + bonus.critDmg
  let hp = s.hp
  let enemyHp = enemy.hp
  let gutsUsed = false
  let phoenixUsed = false
  const turns: TurnLog[] = []

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

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const log: TurnLog = { turn, hits: [], taken: 0, dodged: false, healed: 0, guts: false, revive: false, hp, enemyHp }
    const swings = has('double') && r() < 0.25 ? 2 : 1
    let dealt = 0
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
    if (has('lifesteal') && dealt > 0) {
      const before = hp
      hp = Math.min(s.hp, hp + Math.round(dealt * 0.1))
      log.healed += hp - before
    }
    if (enemyHp > 0) {
      if (has('dodge') && r() < 0.15) {
        log.dodged = true
      } else {
        let taken = enemy.atk * (0.9 + r() * 0.2) * job.guard * bonus.guard
        if (has('wall')) taken *= 0.8
        if (has('barrier') && turn <= 3) taken *= 0.5
        log.taken = Math.max(1, Math.round(taken))
        hp -= log.taken
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
      if (hp > 0) {
        const heal = s.heal + (has('regen') ? Math.round(s.hp * 0.05) : 0)
        const before = hp
        hp = Math.min(s.hp, hp + heal)
        log.healed += hp - before
      }
    }
    log.hp = Math.max(0, hp)
    log.enemyHp = enemyHp
    turns.push(log)
    if (enemyHp <= 0 || hp <= 0) break
  }
  return { win: enemyHp <= 0, turns, maxHp: s.hp, enemy }
}

/** 勝率の目安 (表示用) */
export function winRate(p: BattleStats, enemy: Enemy, trials = 60) {
  let wins = 0
  for (let i = 0; i < trials; i++) if (simulateBattle(p, enemy, 7919 * (i + 1)).win) wins++
  return wins / trials
}

/** ボス撃破の報酬ゴールド */
export const bossGold = (stage: number) => 40 + stage * 20

// ---------- 経験値・ゴールド ----------
export const WEIGHT_XP: Record<Weight, number> = { S: 10, M: 20, L: 40 }
export const WEIGHT_LABEL: Record<Weight, string> = { S: '小', M: '中', L: '大' }
export const WEIGHTS: Weight[] = ['S', 'M', 'L']
/** 本人が選べる作業量: AI の判定から 1 段階まで (中 → 小・大、小 → 中、大 → 中)。判定前は選べない */
export const weightChoices = (ai: Weight | null | undefined): Weight[] =>
  ai ? WEIGHTS.filter((w) => Math.abs(WEIGHTS.indexOf(w) - WEIGHTS.indexOf(ai)) <= 1) : []

/** AI が作業量を判定するときの基準 (説明画面にもそのまま出す) */
export const WEIGHT_GUIDE: Record<Weight, string> = { S: '15分以内で終わる', M: '1〜2時間ほど', L: '半日以上・複数の工程' }

/** 分解は 1 回 (1 段) まで、子タスクは合計この数まで */
export const BREAKDOWN_MAX = 7
/** 分解した子タスク 1 件の XP。元タスクの XP を子タスクの数で分け合う (細かくしても合計は増えない) */
export const childXp = (parentWeight: Weight | null, siblings: number) =>
  Math.max(2, Math.round(WEIGHT_XP[parentWeight ?? 'M'] / Math.max(1, siblings)))

/** タスク 1 件の基本 XP の見込み (ボーナス抜き)。表示用 */
export function baseXp(t: { weight?: Weight | null; parent?: { weight: Weight | null; siblings: number } | null; children?: { total: number } | null }) {
  if (t.children?.total) return 0
  if (t.parent) return childXp(t.parent.weight, t.parent.siblings)
  return WEIGHT_XP[t.weight ?? 'M']
}

const JST = 9 * 60 * 60 * 1000
const DAY = 86400000
/** JST の日付の 0 時 (UTC ミリ秒) */
export const jstDayStart = (t: number) => Math.floor((t + JST) / DAY) * DAY - JST
const jstHour = (t: number) => new Date(t + JST).getUTCHours()

/** 完了タスクをボードに残す日数 (過ぎたら履歴へ) */
export const DONE_KEEP_DAYS = 7
/** 完了タスクの履歴を残す日数 */
export const HISTORY_KEEP_DAYS = 400
/** 最近の動きを残す日数 */
export const ACTIVITY_KEEP_DAYS = 90
export const doneDaysLeft = (doneAt: number, now = Date.now()) =>
  Math.max(0, DONE_KEEP_DAYS - Math.floor((now - doneAt) / DAY))

export interface XpInput {
  weight: Weight | null
  /** 基本 XP の上書き (分解した子タスク)。0 なら分解済みの元タスクで XP なし */
  base?: number
  createdAt: number
  now: number
  doneToday: number // この完了より前に今日完了した件数
  doneYesterday: boolean
  source: string
  skills: string[]
  effects?: string[] // 装備の効果
  bonus?: Pick<Bonus, 'xp' | 'gold'> // 隠しスキルの効果
}

export function computeXp(x: XpInput) {
  const bonuses: string[] = []
  const fx = x.effects ?? []
  const has = (id: string) => x.skills.includes(id)
  if (x.base === 0) return { amount: 0, gold: 0, bonuses: ['分解済み: XPは子タスクへ'] }
  let amount = x.base ?? WEIGHT_XP[x.weight ?? 'M']
  if (x.base !== undefined) bonuses.push('分解: XPを分配')
  // 作ってすぐ完了したものは大きく減らす (稼ぎ防止)
  if (x.now - x.createdAt < 2 * 60 * 1000) {
    amount = Math.max(1, Math.round(amount * 0.25))
    bonuses.push('即完了 ×0.25')
  }
  let mult = 1
  const add = (ok: boolean, v: number, label: string) => {
    if (!ok) return
    mult += v
    bonuses.push(label)
  }
  add(has('early') && jstHour(x.now) < 9, 0.2, '早起き +20%')
  add(has('focus') && x.doneToday >= 4, 0.3, '集中 +30%')
  add(has('ai') && x.source === 'ai', 0.1, '分解の達人 +10%')
  add(has('streak') && x.doneYesterday, 0.15, '継続 +15%')
  add(has('scholar'), 0.15, '博識 +15%')
  add(fx.includes('xpup'), 0.1, '装備 XP+10%')
  add((x.bonus?.xp ?? 0) > 0, x.bonus?.xp ?? 0, `隠しスキル XP+${Math.round((x.bonus?.xp ?? 0) * 100)}%`)
  amount = Math.round(amount * mult)
  if (x.doneToday === 0) {
    amount += 5
    bonuses.push('今日の初完了 +5')
  }
  const goldMult = 1 + (fx.includes('goldup') ? 0.2 : 0) + (has('goldsmith') ? 0.3 : 0) + (x.bonus?.gold ?? 0)
  const gold = Math.ceil((amount / 2) * goldMult)
  return { amount, gold, bonuses }
}

// ---------- 装備 ----------
export const CHEST_COST = 100
export const INVENTORY_MAX = 40
export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'head', label: '頭' },
  { key: 'body', label: '胴体' },
  { key: 'feet', label: '靴' },
  { key: 'weapon', label: '武器' },
]
export const RARITY_SELL: Record<Rarity, number> = { N: 10, R: 25, SR: 60, SSR: 150 }
export const RARITY_RATE: [Rarity, number][] = [
  ['SSR', 0.03],
  ['SR', 0.12],
  ['R', 0.3],
  ['N', 1],
]
const RARITY_MULT: Record<Rarity, number> = { N: 1, R: 1.6, SR: 2.4, SSR: 3.5 }

export const EFFECTS: Record<string, string> = {
  first: '先制: 1ターン目の攻撃×2',
  lifesteal: '吸収: 与ダメージの10%回復',
  double: '連撃: 25%で2回攻撃',
  critdmg: '鋭眼: 会心ダメージ+50%',
  xpup: '学び: タスクのXP+10%',
  goldup: '金運: タスクのゴールド+20%',
  thorns: '反撃: 受けたダメージの30%を返す',
  wall: '鉄壁: 受けるダメージ-20%',
  regen: '再生: 毎ターン最大HPの5%回復',
  dodge: '回避: 15%で攻撃をかわす',
}
const EFFECT_POOL: Record<Slot, string[]> = {
  weapon: ['first', 'lifesteal', 'double'],
  head: ['critdmg', 'xpup', 'goldup'],
  body: ['thorns', 'wall', 'regen'],
  feet: ['dodge', 'first', 'goldup'],
}

/** レア度ごとに 1 段ずつ良い名前になる */
const NAMES: Record<Slot, string[]> = {
  head: ['革の帽子', '鉄の兜', '騎士の兜', '竜の兜', '王者の冠'],
  body: ['布の服', '革の鎧', '鋼の鎧', '竜鱗の鎧', '聖なる鎧'],
  feet: ['布の靴', '革のブーツ', '鉄の具足', '疾風の靴', '天馬の靴'],
  weapon: ['木の剣', '鉄の剣', '炎の剣', '雷の槍', '勇者の剣'],
}

/** 装備の強さはステージに比例して伸びる */
export const gearPower = (rarity: Rarity, stage: number) => RARITY_MULT[rarity] * (1 + (stage - 1) * 0.12)

/** 宝箱から装備を 1 つ生成 */
export function rollItem(seed: number, stage: number, forceRarity?: Rarity, forceSlot?: Slot): Omit<Item, 'id'> {
  const r = rng(seed)
  const roll = r()
  const rarity = forceRarity ?? RARITY_RATE.find(([, p]) => roll < p)![0]
  const pick = (['head', 'body', 'feet', 'weapon'] as Slot[])[Math.floor(r() * 4)]
  const slot = forceSlot ?? pick
  const tier = { N: [0, 1], R: [1, 2], SR: [2, 3], SSR: [3, 4] }[rarity]
  const name = NAMES[slot][tier[0] + Math.floor(r() * (tier[1] - tier[0] + 1))]
  const power = gearPower(rarity, stage)
  const j = () => 0.85 + r() * 0.3
  const st = { atk: 0, hp: 0, crit: 0, heal: 0 }
  if (slot === 'weapon') {
    st.atk = Math.round(2.2 * power * j())
    if (rarity !== 'N' && r() < 0.5) st.crit = Math.round(1 + 0.8 * power * j())
  } else if (slot === 'head') {
    st.hp = Math.round(5 * power * j())
    st.crit = Math.round(1 + power * j())
  } else if (slot === 'body') {
    st.hp = Math.round(12 * power * j())
    if (rarity !== 'N' && r() < 0.5) st.heal = Math.round(power * j())
  } else {
    st.atk = Math.round(0.9 * power * j())
    st.hp = Math.round(4 * power * j())
    if (r() < 0.5) st.heal = Math.round(0.6 * power * j())
  }
  const effect = rarity === 'SSR' || (rarity === 'SR' && r() < 0.6) ? EFFECT_POOL[slot][Math.floor(r() * 3)] : null
  return { slot, name, icon: slot, rarity, ...st, effect }
}

// ---------- デイリーミッション ----------
export interface MissionDef {
  id: string
  label: string
  goal: number
  gold: number
  chest?: boolean
}
/** 朝ミッションの締め切り (時) */
export const EARLY_HOUR = 10
const MISSION_POOL: MissionDef[] = [
  { id: 'done5', label: 'タスクを5件完了', goal: 5, gold: 60 },
  { id: 'big', label: '「大」のタスクを1件完了', goal: 1, gold: 40 },
  { id: 'early', label: `朝${EARLY_HOUR}時までに1件完了`, goal: 1, gold: 30 },
  { id: 'battle', label: 'ボスに挑戦する', goal: 1, gold: 20 },
  { id: 'mid2', label: '「中」以上のタスクを2件完了', goal: 2, gold: 40 },
  { id: 'add3', label: 'タスクを3件追加', goal: 3, gold: 20 },
  { id: 'doing2', label: 'タスクを2件進行中にする', goal: 2, gold: 20 },
  { id: 'chest', label: '宝箱を1回開ける', goal: 1, gold: 20 },
]
/** 毎日必ず出るミッション */
export const DAILY_BASE: MissionDef = { id: 'done3', label: 'タスクを3件完了', goal: 3, gold: 30 }
/** 日替わりで選ばれる数 */
export const DAILY_PICKS = 4
/** ○個クリアで宝箱 (id は旧「全部クリア」と同じ 'all' を使い続ける) */
export const DAILY_BONUS_GOAL = 4
export const DAILY_ALL: MissionDef = { id: 'all', label: `ミッションを${DAILY_BONUS_GOAL}個クリア`, goal: DAILY_BONUS_GOAL, gold: 0, chest: true }

/** その日のミッション (日付から決まるので全員共通) */
export function dailyMissions(dayStart: number): MissionDef[] {
  const r = rng(Math.floor(dayStart / DAY))
  const pool = [...MISSION_POOL]
  const picks: MissionDef[] = []
  for (let i = 0; i < DAILY_PICKS; i++) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0])
  return [DAILY_BASE, ...picks, DAILY_ALL]
}

export interface DailyCounts {
  done: number
  big: number
  midPlus: number
  early: number
  battles: number
  adds: number
  doings: number
  chests: number
}

export function missionProgress(m: MissionDef, c: DailyCounts, claimed: string[]) {
  const byId: Record<string, number> = {
    done3: c.done,
    done5: c.done,
    big: c.big,
    mid2: c.midPlus,
    early: c.early,
    battle: c.battles,
    add3: c.adds,
    doing2: c.doings,
    chest: c.chests,
    // 受け取り済みの数 (ボーナス自身は数えない)
    all: claimed.filter((id) => id !== 'all').length,
  }
  const value = byId[m.id] ?? 0
  return { value: Math.min(value, m.goal), done: value >= m.goal, claimed: claimed.includes(m.id) }
}

// ---------- 期限 ----------
/** 期限まであと何日か (JST の日付で比較。0 = 今日、負 = 期限切れ) */
export function daysUntilDue(due: string, now = Date.now()) {
  const today = jstDayStart(now)
  const [y, m, d] = due.split('-').map(Number)
  const dueStart = Date.UTC(y, m - 1, d) - JST
  return Math.round((dueStart - today) / DAY)
}

/** JST の今日の日付 (YYYY-MM-DD) */
export function jstToday(now = Date.now()) {
  return new Date(jstDayStart(now) + JST).toISOString().slice(0, 10)
}

// ---------- スキン ----------
export interface SkinDef {
  id: string
  name: string
  emoji: string
  /** 背景のグラデーション */
  bg: string
  level?: number
  stage?: number
}
export const SKINS: SkinDef[] = [
  // 最初から選べる
  { id: 'rabbit', name: 'うさぎ', emoji: '🐰', bg: 'linear-gradient(135deg,#fde2e4,#fad0c4)' },
  { id: 'bear', name: 'くま', emoji: '🐻', bg: 'linear-gradient(135deg,#e6c9a8,#c79a6b)' },
  { id: 'hamster', name: 'ハムスター', emoji: '🐹', bg: 'linear-gradient(135deg,#fff1d6,#ffd59e)' },
  { id: 'koala', name: 'コアラ', emoji: '🐨', bg: 'linear-gradient(135deg,#e0e7ef,#b8c6db)' },
  { id: 'tiger', name: 'とら', emoji: '🐯', bg: 'linear-gradient(135deg,#ffe29f,#ffa751)' },
  { id: 'pig', name: 'ぶた', emoji: '🐷', bg: 'linear-gradient(135deg,#ffd1dc,#ff9aae)' },
  { id: 'monkey', name: 'さる', emoji: '🐵', bg: 'linear-gradient(135deg,#f3e0c7,#d9a86c)' },
  { id: 'chick', name: 'ひよこ', emoji: '🐥', bg: 'linear-gradient(135deg,#fff9c4,#ffe066)' },
  { id: 'octopus', name: 'たこ', emoji: '🐙', bg: 'linear-gradient(135deg,#ffc3a0,#ff7e7e)' },
  { id: 'owl', name: 'ふくろう', emoji: '🦉', bg: 'linear-gradient(135deg,#d7c9b8,#a68a6d)' },
  { id: 'whale', name: 'くじら', emoji: '🐳', bg: 'linear-gradient(135deg,#b5e8ff,#6ec6ff)' },
  { id: 'cactus', name: 'サボテン', emoji: '🌵', bg: 'linear-gradient(135deg,#d8f5c4,#9be15d)' },
  // レベル・ステージで解放
  { id: 'cat', name: 'ねこ', emoji: '🐱', bg: 'linear-gradient(135deg,#ffe0b2,#ffb74d)', level: 2 },
  { id: 'dog', name: 'いぬ', emoji: '🐶', bg: 'linear-gradient(135deg,#ffecd2,#fcb69f)', level: 3 },
  { id: 'frog', name: 'かえる', emoji: '🐸', bg: 'linear-gradient(135deg,#d4fc79,#96e6a1)', stage: 3 },
  { id: 'fox', name: 'きつね', emoji: '🦊', bg: 'linear-gradient(135deg,#ffd194,#ff8a5c)', level: 5 },
  { id: 'panda', name: 'パンダ', emoji: '🐼', bg: 'linear-gradient(135deg,#f5f7fa,#c3cfe2)', stage: 6 },
  { id: 'penguin', name: 'ペンギン', emoji: '🐧', bg: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)', level: 8 },
  { id: 'lion', name: 'ライオン', emoji: '🦁', bg: 'linear-gradient(135deg,#f6d365,#fda085)', stage: 10 },
  { id: 'robot', name: 'ロボ', emoji: '🤖', bg: 'linear-gradient(135deg,#cfd9df,#a3bded)', level: 12 },
  { id: 'wizard', name: 'まほうつかい', emoji: '🧙', bg: 'linear-gradient(135deg,#c471f5,#fa71cd)', level: 15 },
  { id: 'ninja', name: 'にんじゃ', emoji: '🥷', bg: 'linear-gradient(135deg,#434343,#7a7a7a)', stage: 15 },
  { id: 'unicorn', name: 'ユニコーン', emoji: '🦄', bg: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)', level: 20 },
  { id: 'dragon', name: 'ドラゴン', emoji: '🐉', bg: 'linear-gradient(135deg,#43e97b,#38f9d7)', stage: 20 },
  { id: 'king', name: 'おうさま', emoji: '🤴', bg: 'linear-gradient(135deg,#f7b733,#fc4a1a)', stage: 30 },
]
export const SKIN_MAP: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]))
export const skinUnlocked = (s: SkinDef, level: number, stage: number) => (s.level ?? 0) <= level && (s.stage ?? 0) <= stage
export const skinCondition = (s: SkinDef) => [s.level && `Lv${s.level}`, s.stage && `ステージ${s.stage}到達`].filter(Boolean).join('・')
