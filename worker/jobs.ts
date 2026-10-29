// 上位職 (裏データ)。対応する基本職のレベルが JOB_UNLOCK_LEVEL に達すると選べるようになる。
// フロントには解放済みの定義しか送らない
import { BASE_JOBS, type JobDef } from '../shared/game'

export const JOB_UNLOCK_LEVEL = 10

export const ADVANCED_JOBS: (JobDef & { from: string })[] = [
  { id: 'blademaster', from: 'warrior', name: '剣聖', icon: '⚡', desc: '攻撃・体力・会心すべてが高い', tier: 2, atk: 1.4, hp: 1.25, crit: 10, heal: 1, healAdd: 0, guard: 1, critDmg: 0.3 },
  { id: 'paladin', from: 'knight', name: '聖騎士', icon: '🌟', desc: '守りが固く（受けるダメージ-20%）、回復もできる', tier: 2, atk: 1.2, hp: 1.45, crit: 0, heal: 1, healAdd: 4, guard: 0.8, critDmg: 0 },
  { id: 'assassin', from: 'thief', name: 'アサシン', icon: '🌙', desc: '会心率+30%、会心ダメージ+90%', tier: 2, atk: 1.4, hp: 1.15, crit: 30, heal: 1, healAdd: 0, guard: 1, critDmg: 0.9 },
  { id: 'saint', from: 'cleric', name: '聖女', icon: '👑', desc: '圧倒的な回復力で倒れない', tier: 2, atk: 1.15, hp: 1.3, crit: 0, heal: 1.6, healAdd: 5, guard: 0.9, critDmg: 0 },
  { id: 'archmage', from: 'mage', name: '大賢者', icon: '🔮', desc: '全職業で最高の攻撃力', tier: 2, atk: 2, hp: 1.05, crit: 12, heal: 1, healAdd: 0, guard: 1, critDmg: 0 },
]

export const ALL_JOBS: JobDef[] = [...BASE_JOBS, ...ADVANCED_JOBS]
export const JOB_MAP: Record<string, JobDef> = Object.fromEntries(ALL_JOBS.map((j) => [j.id, j]))

/** 職業ごとのレベルから、選べる職業 (基本職 + 解放済みの上位職) を返す */
export function unlockedJobs(levels: Record<string, number>) {
  return ALL_JOBS.filter((j) => j.tier === 1 || (levels[(j as (typeof ADVANCED_JOBS)[number]).from] ?? 1) >= JOB_UNLOCK_LEVEL)
}

/** 上位職を解放する基本職なら、その上位職 */
export const advancedOf = (baseId: string) => ADVANCED_JOBS.find((j) => j.from === baseId)
