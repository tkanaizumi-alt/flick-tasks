/** 繰り返しタスクのルール: daily (毎日) / weekdays (平日) / weekly:0-6 (毎週その曜日、0 = 日曜) / monthly:1-31 (毎月その日) */
export type RecurRule = string

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

export function isRule(v: unknown): v is RecurRule {
  if (v === 'daily' || v === 'weekdays') return true
  if (typeof v !== 'string') return false
  const m = v.match(/^(weekly|monthly):(\d{1,2})$/)
  if (!m) return false
  const n = Number(m[2])
  return m[1] === 'weekly' ? n >= 0 && n <= 6 : n >= 1 && n <= 31
}

export function ruleLabel(rule: RecurRule) {
  if (rule === 'daily') return '毎日'
  if (rule === 'weekdays') return '平日'
  const [kind, n] = rule.split(':')
  return kind === 'weekly' ? `毎週${WEEK[Number(n)]}曜` : `毎月${n}日`
}

/** その日 (YYYY-MM-DD) に作るかどうか。毎月 31 日のように無い日は月末に作る */
export function ruleMatches(rule: RecurRule, day: string) {
  const d = new Date(`${day}T00:00:00Z`)
  const dow = d.getUTCDay()
  if (rule === 'daily') return true
  if (rule === 'weekdays') return dow >= 1 && dow <= 5
  const [kind, n] = rule.split(':')
  if (kind === 'weekly') return dow === Number(n)
  const date = d.getUTCDate()
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return date === Math.min(Number(n), last)
}

/** 選択肢 (今日の曜日・日付から作る) */
export function ruleChoices(today: string): { rule: RecurRule; label: string }[] {
  const d = new Date(`${today}T00:00:00Z`)
  const rules = ['daily', 'weekdays', `weekly:${d.getUTCDay()}`, `monthly:${d.getUTCDate()}`]
  return rules.map((rule) => ({ rule, label: ruleLabel(rule) }))
}
