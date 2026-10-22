// ゲームのルール。サーバー (実際の判定) とフロント (勝率の目安表示) の両方で使う純粋関数のみ

export type StatKey = 'atk' | 'hp' | 'crit' | 'heal'
export type Weight = 'S' | 'M' | 'L'
export type Branch = 'warrior' | 'guardian' | 'sage'

export type Slot = 'weapon' | 'armor' | 'charm'
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

export interface PlayerState {
  xp: number
  stats: Record<StatKey, number> // 振り分けたポイント数
  skills: string[]
  stage: number // 次に挑むステージ (1 始まり)
  resets: number // リセットの書
  gold: number
  items: Item[]
  equipped: Partial<Record<Slot, string>> // スロット → 装備中のアイテム ID
}

type BattleStats = Pick<PlayerState, 'stats' | 'skills'> & Partial<Pick<PlayerState, 'items' | 'equipped'>>

export function equippedItems(p: Partial<Pick<PlayerState, 'items' | 'equipped'>>): Item[] {
  const ids = Object.values(p.equipped ?? {})
  return (p.items ?? []).filter((i) => ids.includes(i.id))
}

/** スキルと装備の効果をまとめて判定 */
export function hasEffect(p: BattleStats, id: string) {
  return p.skills.includes(id) || equippedItems(p).some((i) => i.effect === id)
}

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

export function spInfo(p: PlayerState) {
  const { level } = levelInfo(p.xp)
  const total = (level - 1) * SP_PER_LEVEL
  const spentStats = Object.values(p.stats).reduce((a, b) => a + b, 0)
  const spentSkills = p.skills.reduce((a, id) => a + (SKILL_MAP[id]?.cost ?? 0), 0)
  return { total, spent: spentStats + spentSkills, free: total - spentStats - spentSkills }
}

// ---------- ステータス ----------
export const STATS: { key: StatKey; label: string; unit: string; per: number; base: number }[] = [
  { key: 'atk', label: '攻撃', unit: '', per: 2, base: 6 },
  { key: 'hp', label: '体力', unit: '', per: 10, base: 50 },
  { key: 'crit', label: '会心', unit: '%', per: 2, base: 5 },
  { key: 'heal', label: '回復', unit: '/ターン', per: 2, base: 0 },
]

export function effectiveStats(p: Pick<PlayerState, 'stats'> & Partial<Pick<PlayerState, 'items' | 'equipped'>>) {
  const gear = equippedItems(p)
  const v = (k: StatKey) => {
    const s = STATS.find((x) => x.key === k)!
    return s.base + s.per * (p.stats[k] ?? 0) + gear.reduce((a, i) => a + i[k], 0)
  }
  return { atk: v('atk'), hp: v('hp'), crit: Math.min(60, v('crit')), heal: v('heal') }
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
  { key: 'warrior', label: '戦士', icon: '⚔️' },
  { key: 'guardian', label: '守護', icon: '🛡️' },
  { key: 'sage', label: '賢者', icon: '📜' },
]

export const SKILLS: Skill[] = [
  { id: 'double', branch: 'warrior', name: '連撃', desc: '25%の確率で2回攻撃', cost: 2 },
  { id: 'smash', branch: 'warrior', name: '渾身の一撃', desc: '3ターンごとに攻撃×3', cost: 3, requires: 'double' },
  { id: 'critup', branch: 'warrior', name: '会心強化', desc: '会心ダメージ×2→×2.5', cost: 4, requires: 'smash' },
  { id: 'wall', branch: 'guardian', name: '鉄壁', desc: '受けるダメージ-20%', cost: 2 },
  { id: 'regen', branch: 'guardian', name: '自己再生', desc: '毎ターン最大HPの5%回復', cost: 3, requires: 'wall' },
  { id: 'guts', branch: 'guardian', name: '不屈', desc: '1度だけHP1で踏みとどまる', cost: 4, requires: 'regen' },
  { id: 'early', branch: 'sage', name: '早起きの加護', desc: '朝9時までの完了でXP+20%', cost: 2 },
  { id: 'focus', branch: 'sage', name: '集中', desc: '1日5件目以降の完了でXP+30%', cost: 3, requires: 'early' },
  { id: 'ai', branch: 'sage', name: '分解の達人', desc: 'AIで作ったタスクのXP+10%', cost: 2, requires: 'early' },
]
export const SKILL_MAP: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]))

export function canLearn(p: PlayerState, id: string): string | null {
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

const BOSSES: Omit<Enemy, 'stage'>[] = [
  { name: 'スライム', icon: '💧', hp: 30, atk: 4 },
  { name: 'ゴブリン', icon: '👺', hp: 70, atk: 7 },
  { name: 'オオカミ', icon: '🐺', hp: 120, atk: 10 },
  { name: 'ゴーレム', icon: '🗿', hp: 200, atk: 13 },
  { name: '魔術師', icon: '🧙', hp: 280, atk: 17 },
  { name: 'ワイバーン', icon: '🦅', hp: 380, atk: 21 },
  { name: '騎士団長', icon: '🤺', hp: 500, atk: 26 },
  { name: 'ドラゴン', icon: '🐲', hp: 650, atk: 31 },
  { name: '堕天使', icon: '👼', hp: 830, atk: 37 },
  { name: '魔王', icon: '😈', hp: 1050, atk: 44 },
]

export function enemyForStage(stage: number): Enemy {
  if (stage <= BOSSES.length) return { stage, ...BOSSES[stage - 1] }
  // 魔王の先は無限の塔。1階ごとに強くなる
  const floor = stage - BOSSES.length
  const last = BOSSES[BOSSES.length - 1]
  return {
    stage,
    name: `無限の塔 ${floor}階`,
    icon: '🗼',
    hp: Math.round(last.hp * Math.pow(1.18, floor)),
    atk: Math.round(last.atk * Math.pow(1.12, floor)),
  }
}

// ---------- 戦闘 ----------
export interface TurnLog {
  turn: number
  hits: { dmg: number; crit: boolean; smash: boolean }[]
  taken: number
  healed: number
  guts: boolean
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

export const MAX_TURNS = 25

export function simulateBattle(p: BattleStats, enemy: Enemy, seed: number): BattleResult {
  const r = rng(seed)
  const s = effectiveStats(p)
  const has = (id: string) => hasEffect(p, id)
  let hp = s.hp
  let enemyHp = enemy.hp
  let gutsUsed = false
  const turns: TurnLog[] = []

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const log: TurnLog = { turn, hits: [], taken: 0, healed: 0, guts: false, hp, enemyHp }
    const swings = has('double') && r() < 0.25 ? 2 : 1
    let dealt = 0
    for (let i = 0; i < swings && enemyHp > 0; i++) {
      const crit = r() * 100 < s.crit
      const smash = i === 0 && has('smash') && turn % 3 === 0
      let dmg = s.atk * (0.9 + r() * 0.2)
      if (crit) dmg *= has('critup') ? 2.5 : 2
      if (smash) dmg *= 3
      if (turn === 1 && i === 0 && has('first')) dmg *= 2
      dmg = Math.max(1, Math.round(dmg))
      enemyHp = Math.max(0, enemyHp - dmg)
      dealt += dmg
      log.hits.push({ dmg, crit, smash })
    }
    if (has('lifesteal') && dealt > 0) {
      const before = hp
      hp = Math.min(s.hp, hp + Math.round(dealt * 0.1))
      log.healed += hp - before
    }
    if (enemyHp > 0) {
      let taken = enemy.atk * (0.9 + r() * 0.2)
      if (has('wall')) taken *= 0.8
      log.taken = Math.max(1, Math.round(taken))
      hp -= log.taken
      if (has('thorns')) enemyHp = Math.max(0, enemyHp - Math.round(log.taken * 0.3))
      if (hp <= 0 && has('guts') && !gutsUsed) {
        hp = 1
        gutsUsed = true
        log.guts = true
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

const JST = 9 * 60 * 60 * 1000
const DAY = 86400000
/** JST の日付の 0 時 (UTC ミリ秒) */
export const jstDayStart = (t: number) => Math.floor((t + JST) / DAY) * DAY - JST
const jstHour = (t: number) => new Date(t + JST).getUTCHours()

/** 完了タスクを残す日数 */
export const DONE_KEEP_DAYS = 7
export const doneDaysLeft = (doneAt: number, now = Date.now()) =>
  Math.max(0, DONE_KEEP_DAYS - Math.floor((now - doneAt) / DAY))

export interface XpInput {
  weight: Weight | null
  createdAt: number
  now: number
  doneToday: number // この完了より前に今日完了した件数
  source: string
  skills: string[]
  effects?: string[] // 装備の効果
}

export function computeXp(x: XpInput) {
  const bonuses: string[] = []
  const fx = x.effects ?? []
  let amount = WEIGHT_XP[x.weight ?? 'M']
  // 作ってすぐ完了したものは大きく減らす (稼ぎ防止)
  if (x.now - x.createdAt < 2 * 60 * 1000) {
    amount = Math.max(1, Math.round(amount * 0.25))
    bonuses.push('即完了 ×0.25')
  }
  let mult = 1
  if (x.skills.includes('early') && jstHour(x.now) < 9) {
    mult += 0.2
    bonuses.push('早起き +20%')
  }
  if (x.skills.includes('focus') && x.doneToday >= 4) {
    mult += 0.3
    bonuses.push('集中 +30%')
  }
  if (x.skills.includes('ai') && x.source === 'ai') {
    mult += 0.1
    bonuses.push('分解の達人 +10%')
  }
  if (fx.includes('xpup')) {
    mult += 0.1
    bonuses.push('装備 XP+10%')
  }
  amount = Math.round(amount * mult)
  if (x.doneToday === 0) {
    amount += 5
    bonuses.push('今日の初完了 +5')
  }
  const gold = Math.ceil((amount / 2) * (fx.includes('goldup') ? 1.2 : 1))
  return { amount, gold, bonuses }
}

// ---------- 装備 ----------
export const CHEST_COST = 100
export const INVENTORY_MAX = 40
export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'weapon', label: '武器' },
  { key: 'armor', label: '防具' },
  { key: 'charm', label: 'お守り' },
]
export const RARITY_SELL: Record<Rarity, number> = { N: 10, R: 25, SR: 60, SSR: 150 }
const RARITY_ROLL: [Rarity, number][] = [
  ['SSR', 0.03],
  ['SR', 0.12],
  ['R', 0.3],
  ['N', 1],
]
const RARITY_MULT: Record<Rarity, number> = { N: 1, R: 1.6, SR: 2.4, SSR: 3.5 }

export const EFFECTS: Record<string, string> = {
  first: '先制: 1ターン目の攻撃×2',
  lifesteal: '吸収: 与ダメージの10%回復',
  thorns: '反撃: 受けたダメージの30%を返す',
  double: '連撃: 25%で2回攻撃',
  wall: '鉄壁: 受けるダメージ-20%',
  xpup: '学び: タスクのXP+10%',
  goldup: '金運: タスクのゴールド+20%',
}
const EFFECT_POOL: Record<Slot, string[]> = {
  weapon: ['first', 'lifesteal', 'double'],
  armor: ['thorns', 'wall', 'lifesteal'],
  charm: ['xpup', 'goldup', 'first'],
}

const BASES: Record<Slot, { name: string; icon: string }[]> = {
  weapon: [
    { name: '木の剣', icon: '🪵' },
    { name: '鉄の剣', icon: '🗡️' },
    { name: '炎の剣', icon: '🔥' },
    { name: '雷の槍', icon: '⚡' },
    { name: '勇者の剣', icon: '⚔️' },
  ],
  armor: [
    { name: '布の服', icon: '👕' },
    { name: '革の鎧', icon: '🦺' },
    { name: '鋼の盾', icon: '🛡️' },
    { name: '竜鱗の鎧', icon: '🐉' },
    { name: '聖なる鎧', icon: '✨' },
  ],
  charm: [
    { name: '幸運のお守り', icon: '🧿' },
    { name: '四つ葉', icon: '🍀' },
    { name: '星のかけら', icon: '⭐' },
    { name: '女神の涙', icon: '💎' },
    { name: '王の冠', icon: '👑' },
  ],
}

/** 宝箱から装備を 1 つ生成。後半のステージほど数値が伸びる */
export function rollItem(seed: number, stage: number, forceRarity?: Rarity): Omit<Item, 'id'> {
  const r = rng(seed)
  const roll = r()
  const rarity = forceRarity ?? RARITY_ROLL.find(([, p]) => roll < p)![0]
  const slot = (['weapon', 'armor', 'charm'] as Slot[])[Math.floor(r() * 3)]
  const tier = { N: [0, 1], R: [1, 2], SR: [2, 3], SSR: [3, 4] }[rarity]
  const base = BASES[slot][tier[0] + Math.floor(r() * (tier[1] - tier[0] + 1))]
  const power = RARITY_MULT[rarity] * (1 + (stage - 1) * 0.25)
  const jitter = () => 0.85 + r() * 0.3
  const stats = { atk: 0, hp: 0, crit: 0, heal: 0 }
  if (slot === 'weapon') {
    stats.atk = Math.round(2 * power * jitter())
    if (rarity !== 'N' && r() < 0.5) stats.crit = Math.round(1 + power * jitter())
  } else if (slot === 'armor') {
    stats.hp = Math.round(10 * power * jitter())
    if (rarity !== 'N' && r() < 0.5) stats.heal = Math.round(power * jitter())
  } else {
    stats.crit = Math.round(1.5 * power * jitter())
    if (r() < 0.5) stats.heal = Math.round(power * 0.8 * jitter())
    else stats.atk = Math.round(power * jitter())
  }
  const effect = rarity === 'SSR' || (rarity === 'SR' && r() < 0.6) ? EFFECT_POOL[slot][Math.floor(r() * 3)] : null
  return { slot, name: base.name, icon: base.icon, rarity, ...stats, effect }
}

// ---------- デイリーミッション ----------
export interface MissionDef {
  id: string
  label: string
  goal: number
  gold: number
  chest?: boolean
}
const MISSION_POOL: MissionDef[] = [
  { id: 'done5', label: 'タスクを5件完了', goal: 5, gold: 60 },
  { id: 'big', label: '「大」のタスクを1件完了', goal: 1, gold: 40 },
  { id: 'early', label: '朝9時までに1件完了', goal: 1, gold: 30 },
  { id: 'battle', label: 'ボスに挑戦する', goal: 1, gold: 20 },
  { id: 'mid2', label: '「中」以上のタスクを2件完了', goal: 2, gold: 40 },
]
export const DAILY_BASE: MissionDef = { id: 'done3', label: 'タスクを3件完了', goal: 3, gold: 30 }
export const DAILY_ALL: MissionDef = { id: 'all', label: '今日のミッションを全部クリア', goal: 3, gold: 0, chest: true }

/** その日のミッション (日付から決まるので全員共通) */
export function dailyMissions(dayStart: number): MissionDef[] {
  const r = rng(Math.floor(dayStart / DAY))
  const pool = [...MISSION_POOL]
  const picks: MissionDef[] = []
  for (let i = 0; i < 2; i++) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0])
  return [DAILY_BASE, ...picks, DAILY_ALL]
}

export interface DailyCounts {
  done: number
  big: number
  midPlus: number
  early: number
  battles: number
}

export function missionProgress(m: MissionDef, c: DailyCounts, claimed: string[]) {
  const byId: Record<string, number> = {
    done3: c.done,
    done5: c.done,
    big: c.big,
    mid2: c.midPlus,
    early: c.early,
    battle: c.battles,
    all: claimed.filter((id) => id !== 'all').length,
  }
  const value = byId[m.id] ?? 0
  return { value: Math.min(value, m.goal), done: value >= m.goal, claimed: claimed.includes(m.id) }
}
