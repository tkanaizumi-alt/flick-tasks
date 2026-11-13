// 上位職・複合職 (裏データ)。条件の職業がすべて JOB_UNLOCK_LEVEL に達すると選べるようになる。
// フロントには解放済みの定義と、まだ見つかっていない職業の「数」しか送らない
import { BASE_JOBS, type JobDef } from '../shared/game'

export const JOB_UNLOCK_LEVEL = 10

type LockedJob = JobDef & { requires: string[] }

/** 上位職: 基本職を Lv10 まで育てると現れる */
export const ADVANCED_JOBS: (LockedJob & { from: string })[] = [
  { id: 'blademaster', from: 'warrior', name: '剣聖', icon: '⚡', desc: '攻撃・体力・会心すべてが高い', tier: 2, atk: 1.4, hp: 1.25, crit: 10, heal: 1, healAdd: 0, guard: 1, critDmg: 0.3 },
  { id: 'paladin', from: 'knight', name: '聖騎士', icon: '🌟', desc: '守りが固く（受けるダメージ-20%）、回復もできる', tier: 2, atk: 1.2, hp: 1.45, crit: 0, heal: 1, healAdd: 4, guard: 0.8, critDmg: 0 },
  { id: 'assassin', from: 'thief', name: 'アサシン', icon: '🌙', desc: '会心率+30%、会心ダメージ+90%', tier: 2, atk: 1.4, hp: 1.15, crit: 30, heal: 1, healAdd: 0, guard: 1, critDmg: 0.9 },
  { id: 'saint', from: 'cleric', name: '聖女', icon: '👑', desc: '圧倒的な回復力で倒れない', tier: 2, atk: 1.15, hp: 1.3, crit: 0, heal: 1.6, healAdd: 5, guard: 0.9, critDmg: 0 },
  { id: 'archmage', from: 'mage', name: '大賢者', icon: '🔮', desc: '全職業で最高の攻撃力', tier: 2, atk: 2, hp: 1.05, crit: 12, heal: 1, healAdd: 0, guard: 1, critDmg: 0 },
].map((j) => ({ ...j, tier: 2 as const, requires: [j.from] }))

/**
 * 複合職 (隠し職業): 上位職を 2 つ Lv10 まで育てると現れる。職業そのものが戦闘効果を 1 つ持つ。
 * 勇者だけは上位職 5 つすべてが条件
 */
export const SECRET_JOBS: LockedJob[] = [
  { id: 'spellblade', requires: ['blademaster', 'archmage'], name: '魔法剣士', icon: '🌀', desc: '魔力をまとった剣。1ターン目の攻撃×2', tier: 3, atk: 1.6, hp: 1.3, crit: 12, heal: 1, healAdd: 0, guard: 1, critDmg: 0.3, effects: ['first'] },
  { id: 'monk', requires: ['blademaster', 'saint'], name: '拳聖', icon: '🥋', desc: '25%で2回攻撃。自分で傷も癒やす', tier: 3, atk: 1.5, hp: 1.4, crit: 10, heal: 1.35, healAdd: 4, guard: 1, critDmg: 0, effects: ['double'] },
  { id: 'darkknight', requires: ['paladin', 'assassin'], name: '暗黒騎士', icon: '🦇', desc: '与ダメージの10%を吸収。守りも会心も強い', tier: 3, atk: 1.4, hp: 1.35, crit: 20, heal: 1, healAdd: 0, guard: 0.85, critDmg: 0.5, effects: ['lifesteal'] },
  { id: 'guardian', requires: ['paladin', 'saint'], name: '守護天使', icon: '😇', desc: '受けるダメージ-25%・大回復。1度だけHP1で踏みとどまる', tier: 3, atk: 1.2, hp: 1.5, crit: 0, heal: 1.5, healAdd: 6, guard: 0.75, critDmg: 0, effects: ['guts'] },
  { id: 'illusionist', requires: ['assassin', 'archmage'], name: '幻影師', icon: '🎭', desc: '15%で攻撃をかわす。会心で大ダメージ', tier: 3, atk: 1.7, hp: 1.1, crit: 26, heal: 1, healAdd: 0, guard: 1, critDmg: 0.7, effects: ['dodge'] },
  { id: 'holyblade', requires: ['blademaster', 'paladin'], name: '聖剣士', icon: '⚜️', desc: '受けたダメージの25%を返す。攻守に隙がない', tier: 3, atk: 1.35, hp: 1.35, crit: 6, heal: 1, healAdd: 2, guard: 0.85, critDmg: 0.2, effects: ['counter'] },
  { id: 'samurai', requires: ['blademaster', 'assassin'], name: '侍', icon: '🏯', desc: '敵のHPが25%以下でダメージ×2。会心も鋭い', tier: 3, atk: 1.5, hp: 1.25, crit: 20, heal: 1, healAdd: 0, guard: 1, critDmg: 0.6, effects: ['finisher'] },
  { id: 'runeknight', requires: ['paladin', 'archmage'], name: '魔導騎士', icon: '🔱', desc: '最初の3ターン、受けるダメージ-50%。魔法の力で強く打つ', tier: 3, atk: 1.6, hp: 1.3, crit: 8, heal: 1, healAdd: 0, guard: 0.9, critDmg: 0, effects: ['barrier'] },
  { id: 'shrine', requires: ['assassin', 'saint'], name: '影の巫女', icon: '⛩️', desc: '会心のとき、もう一度攻撃。傷も癒やす', tier: 3, atk: 1.35, hp: 1.25, crit: 25, heal: 1.3, healAdd: 3, guard: 1, critDmg: 0.5, effects: ['combo'] },
  { id: 'sorcerer', requires: ['saint', 'archmage'], name: '大魔導師', icon: '🌌', desc: '1度だけHP50%で復活。攻撃と回復の両方が高い', tier: 3, atk: 1.5, hp: 1.15, crit: 10, heal: 1.4, healAdd: 3, guard: 1, critDmg: 0, effects: ['phoenix'] },
  { id: 'hero', requires: ['blademaster', 'paladin', 'assassin', 'saint', 'archmage'], name: '勇者', icon: '🌠', desc: 'すべての道を極めた者。先制し、毎ターン回復する', tier: 3, atk: 1.55, hp: 1.4, crit: 12, heal: 1.15, healAdd: 3, guard: 0.88, critDmg: 0.3, effects: ['first', 'regen'] },
]

const LOCKED_JOBS: LockedJob[] = [...ADVANCED_JOBS, ...SECRET_JOBS]
export const ALL_JOBS: JobDef[] = [...BASE_JOBS, ...LOCKED_JOBS]
export const JOB_MAP: Record<string, JobDef> = Object.fromEntries(ALL_JOBS.map((j) => [j.id, j]))

const isOpen = (j: JobDef, levels: Record<string, number>) =>
  j.tier === 1 || (j as LockedJob).requires.every((id) => (levels[id] ?? 1) >= JOB_UNLOCK_LEVEL)

/** 職業ごとのレベルから、選べる職業 (基本職 + 解放済みの上位職・複合職) を返す */
export function unlockedJobs(levels: Record<string, number>) {
  return ALL_JOBS.filter((j) => isOpen(j, levels))
}

/** まだ見つかっていない職業の数 (中身は見せない) */
export const lockedJobCount = (levels: Record<string, number>) => LOCKED_JOBS.filter((j) => !isOpen(j, levels)).length

/** jobId の職業 XP が増えて level になったとき、新しく解放される職業 */
export function newlyUnlocked(levels: Record<string, number>, jobId: string, level: number) {
  const after = { ...levels, [jobId]: level }
  return LOCKED_JOBS.filter((j) => !isOpen(j, levels) && isOpen(j, after))
}

/** 上位職を解放する基本職なら、その上位職 */
export const advancedOf = (baseId: string) => ADVANCED_JOBS.find((j) => j.from === baseId)
