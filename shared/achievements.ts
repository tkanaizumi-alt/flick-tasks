/** 実績 (称号)。条件はサーバーで集計した数値 (AchievementStats) で判定する */

export interface AchievementStats {
  done: number // 完了したタスク (XP が付いたもの)
  streak: number // 今の連続日数
  bestStreak: number // これまでの最長連続日数
  big: number // 大以上の完了
  xl: number // 特大の完了
  helps: number // 他の人のタスクを進めた回数
  requests: number // 依頼されたタスクの完了
  split: number // 分解した子タスクの完了
  early: number // 朝 10 時までの完了
  cleared: number // クリアしたステージ数
  level: number
  ssr: number // 持っている SSR 装備
}

export interface AchievementDef {
  id: string
  /** 称号として名前の横に出す */
  name: string
  icon: string
  desc: string
  stat: keyof AchievementStats
  goal: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'はじめの一歩', icon: '🌱', desc: 'タスクを1件完了', stat: 'done', goal: 1 },
  { id: 'done10', name: '見習い', icon: '📗', desc: 'タスクを10件完了', stat: 'done', goal: 10 },
  { id: 'done50', name: '働き者', icon: '📘', desc: 'タスクを50件完了', stat: 'done', goal: 50 },
  { id: 'done200', name: '仕事の鬼', icon: '📕', desc: 'タスクを200件完了', stat: 'done', goal: 200 },
  { id: 'streak3', name: '三日坊主卒業', icon: '🔥', desc: '3日連続で完了', stat: 'bestStreak', goal: 3 },
  { id: 'streak7', name: '習慣の人', icon: '🔥', desc: '7日連続で完了', stat: 'bestStreak', goal: 7 },
  { id: 'streak30', name: '継続の達人', icon: '☄️', desc: '30日連続で完了', stat: 'bestStreak', goal: 30 },
  { id: 'big10', name: '大物狙い', icon: '🐋', desc: '「大」以上のタスクを10件完了', stat: 'big', goal: 10 },
  { id: 'xl1', name: '伝説の案件', icon: '🏔️', desc: '「特大」のタスクを完了', stat: 'xl', goal: 1 },
  { id: 'help5', name: '助っ人', icon: '🤝', desc: '他の人のタスクを5回進める', stat: 'helps', goal: 5 },
  { id: 'help30', name: 'みんなの味方', icon: '🦸', desc: '他の人のタスクを30回進める', stat: 'helps', goal: 30 },
  { id: 'req5', name: '頼れる人', icon: '📨', desc: '依頼されたタスクを5件完了', stat: 'requests', goal: 5 },
  { id: 'split20', name: '分解名人', icon: '🧩', desc: '分解したタスクを20件完了', stat: 'split', goal: 20 },
  { id: 'early20', name: '朝型', icon: '🌅', desc: '朝10時までに20件完了', stat: 'early', goal: 20 },
  { id: 'stage10', name: '冒険者', icon: '🗺️', desc: 'ステージ10をクリア', stat: 'cleared', goal: 10 },
  { id: 'stage30', name: '伝説の勇者', icon: '👑', desc: 'ステージ30をクリア', stat: 'cleared', goal: 30 },
  { id: 'lv20', name: 'ベテラン', icon: '🎖️', desc: 'レベル20になる', stat: 'level', goal: 20 },
  { id: 'ssr', name: '幸運の持ち主', icon: '🍀', desc: 'SSRの装備を手に入れる', stat: 'ssr', goal: 1 },
]
export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))

export const achieved = (a: AchievementDef, s: AchievementStats) => s[a.stat] >= a.goal

/**
 * 連続日数。days は完了した日 (JST の通し日番号) の一覧。
 * 今日まだ完了していなくても、昨日まで続いていれば途切れていない扱い
 */
export function streakOf(days: number[], today: number) {
  const set = new Set(days)
  let d = set.has(today) ? today : today - 1
  let n = 0
  while (set.has(d)) {
    n++
    d--
  }
  return n
}

/** これまでの最長連続日数 */
export function bestStreakOf(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}
