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
  ssr: number // 持っている SSR 以上の装備
  days: number // タスクを完了した日の合計 (連続でなくてよい)
  night: number // 夜 22 時〜朝 4 時の完了
  weekend: number // 土日の完了
  maxDay: number // 1 日に完了した数の最多
  ur: number // 持っている UR の装備
  comments: number // 書いたコメント
  reactions: number // 他の人のタスクに付けたリアクション
}

export interface AchievementDef {
  id: string
  /** 称号として名前の横に出す */
  name: string
  icon: string
  desc: string
  stat: keyof AchievementStats
  goal: number
  /** 難しさ。称号の色が変わる (1 ブロンズ / 2 シルバー / 3 ゴールド / 4 レジェンド) */
  tier?: Tier
  /** 隠し実績: 取るまで名前も条件も見せない */
  hidden?: boolean
}

export type Tier = 1 | 2 | 3 | 4
export const TIERS: Record<Tier, { key: string; label: string }> = {
  1: { key: 'bronze', label: 'ブロンズ' },
  2: { key: 'silver', label: 'シルバー' },
  3: { key: 'gold', label: 'ゴールド' },
  4: { key: 'legend', label: 'レジェンド' },
}
/** 称号の色 (CSS のクラス t-bronze など) */
export const tierClass = (id: string | null | undefined) => `t-${TIERS[(id && ACHIEVEMENT_MAP[id]?.tier) || 1].key}`

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', name: 'はじめの一歩', icon: '🌱', desc: 'タスクを1件完了', stat: 'done', goal: 1, tier: 1 },
  { id: 'done10', name: '見習い', icon: '📗', desc: 'タスクを10件完了', stat: 'done', goal: 10, tier: 1 },
  { id: 'done50', name: '働き者', icon: '📘', desc: 'タスクを50件完了', stat: 'done', goal: 50, tier: 2 },
  { id: 'done200', name: '仕事の鬼', icon: '📕', desc: 'タスクを200件完了', stat: 'done', goal: 200, tier: 3 },
  { id: 'streak3', name: '三日坊主卒業', icon: '🔥', desc: '3日連続で完了', stat: 'bestStreak', goal: 3, tier: 1 },
  { id: 'streak7', name: '習慣の人', icon: '📅', desc: 'タスクを完了した日が合計7日', stat: 'days', goal: 7, tier: 2 },
  { id: 'streak30', name: '継続の達人', icon: '☄️', desc: 'タスクを完了した日が合計30日', stat: 'days', goal: 30, tier: 4 },
  { id: 'big10', name: '大物狙い', icon: '🐋', desc: '「大」以上のタスクを10件完了', stat: 'big', goal: 10, tier: 2 },
  { id: 'xl1', name: '伝説の案件', icon: '🏔️', desc: '「特大」のタスクを完了', stat: 'xl', goal: 1, tier: 3 },
  { id: 'help5', name: '助っ人', icon: '🤝', desc: '他の人のタスクを5回進める', stat: 'helps', goal: 5, tier: 1 },
  { id: 'help30', name: 'みんなの味方', icon: '🦸', desc: '他の人のタスクを30回進める', stat: 'helps', goal: 30, tier: 3 },
  { id: 'req5', name: '頼れる人', icon: '📨', desc: '依頼されたタスクを5件完了', stat: 'requests', goal: 5, tier: 2 },
  { id: 'split20', name: '分解名人', icon: '🧩', desc: '分解したタスクを20件完了', stat: 'split', goal: 20, tier: 2 },
  { id: 'early20', name: '朝型', icon: '🌅', desc: '朝10時までに20件完了', stat: 'early', goal: 20, tier: 2 },
  { id: 'stage10', name: '冒険者', icon: '🗺️', desc: 'ステージ10をクリア', stat: 'cleared', goal: 10, tier: 2 },
  { id: 'stage30', name: '伝説の勇者', icon: '👑', desc: 'ステージ30をクリア', stat: 'cleared', goal: 30, tier: 4 },
  { id: 'lv20', name: 'ベテラン', icon: '🎖️', desc: 'レベル20になる', stat: 'level', goal: 20, tier: 3 },
  { id: 'ssr', name: '幸運の持ち主', icon: '🍀', desc: 'SSR以上の装備を手に入れる', stat: 'ssr', goal: 1, tier: 3 },
]
/** 隠し実績 (取るまで「？？？」) */
export const HIDDEN_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'h_night', name: '夜ふかしの番人', icon: '🦉', desc: '夜22時〜朝4時に10件完了', stat: 'night', goal: 10, tier: 2, hidden: true },
  { id: 'h_weekend', name: '休日出勤', icon: '🏖️', desc: '土日に10件完了', stat: 'weekend', goal: 10, tier: 2, hidden: true },
  { id: 'h_rush', name: '電光石火', icon: '⚡', desc: '1日に15件完了', stat: 'maxDay', goal: 15, tier: 3, hidden: true },
  { id: 'h_talker', name: '話し上手', icon: '💬', desc: 'コメントを50件書く', stat: 'comments', goal: 50, tier: 2, hidden: true },
  { id: 'h_cheer', name: '応援団長', icon: '📣', desc: 'リアクションを30回付ける', stat: 'reactions', goal: 30, tier: 2, hidden: true },
  { id: 'h_xl5', name: '伝説の請負人', icon: '🏰', desc: '「特大」のタスクを5件完了', stat: 'xl', goal: 5, tier: 3, hidden: true },
  { id: 'h_ur', name: '虹をつかむ者', icon: '🌈', desc: 'URの装備を手に入れる', stat: 'ur', goal: 1, tier: 3, hidden: true },
  { id: 'h_days100', name: '百日の功', icon: '💯', desc: 'タスクを完了した日が合計100日', stat: 'days', goal: 100, tier: 4, hidden: true },
]
ACHIEVEMENTS.push(...HIDDEN_ACHIEVEMENTS)

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
