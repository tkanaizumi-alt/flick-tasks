import type { Task } from '../../shared/types'
import { daysUntilDue } from '../../shared/game'

/** 期限の表示。完了したタスクは期限切れ扱いにしない */
export function dueLabel(task: Pick<Task, 'due' | 'status'>) {
  if (!task.due) return null
  const d = daysUntilDue(task.due)
  const [, m, day] = task.due.split('-').map(Number)
  if (task.status === 'done') return { text: `${m}/${day}まで`, tone: 'calm' }
  if (d < 0) return { text: `期限切れ ${-d}日`, tone: 'over' }
  if (d === 0) return { text: '今日まで', tone: 'today' }
  if (d === 1) return { text: '明日まで', tone: 'soon' }
  return { text: `${m}/${day}まで`, tone: d <= 3 ? 'soon' : 'calm' }
}

export function DueBadge({ task }: { task: Pick<Task, 'due' | 'status' | 'dueBy'> }) {
  const l = dueLabel(task)
  if (!l) return null
  return (
    <span className={`due due-${l.tone}`} data-testid="due">
      ⏰ {l.text}
      {task.dueBy && <small>（{task.dueBy.name}）</small>}
    </span>
  )
}
