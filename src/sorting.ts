import type { Task } from '../shared/types'

export const SORT_KEY = 'flick.sort'
/** 並び順: 手動 (新しいものが上・ドラッグで並べ替え) / 重要度順 / 期日順 */
export type SortMode = 'new' | 'priority' | 'due'
export const SORTS: { key: SortMode; label: string }[] = [
  { key: 'new', label: '手動' },
  { key: 'priority', label: '重要度順' },
  { key: 'due', label: '期日順' },
]
const prioRank = (t: Task) => (t.priority === 'high' ? 2 : t.priority === 'low' ? 0 : 1)
/** 期日なしは最後 */
const dueKey = (t: Task) => t.due ?? '9999-12-31'
export const SORT_CMP: Record<SortMode, (a: Task, b: Task) => number> = {
  new: (a, b) => b.position - a.position,
  priority: (a, b) => prioRank(b) - prioRank(a) || dueKey(a).localeCompare(dueKey(b)) || b.position - a.position,
  due: (a, b) => dueKey(a).localeCompare(dueKey(b)) || prioRank(b) - prioRank(a) || b.position - a.position,
}

/** 完了の並び順: 完了日が新しい順 / 古い順 / 重要度順 */
export type DoneSort = 'recent' | 'oldest' | 'priority'
export const DONE_SORT_KEY = 'flick.sort.done'
export const DONE_SORTS: { key: DoneSort; label: string }[] = [
  { key: 'recent', label: '完了が新しい順' },
  { key: 'oldest', label: '古い順' },
  { key: 'priority', label: '重要度順' },
]
const doneAt = (t: Task) => t.doneAt ?? t.updatedAt
export const DONE_CMP: Record<DoneSort, (a: Task, b: Task) => number> = {
  recent: (a, b) => doneAt(b) - doneAt(a),
  oldest: (a, b) => doneAt(a) - doneAt(b),
  priority: (a, b) => prioRank(b) - prioRank(a) || doneAt(b) - doneAt(a),
}
