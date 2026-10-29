import { FLAGS, san, type Task } from '../../shared/types'
import { WEIGHT_LABEL, baseXp } from '../../shared/game'
import { ruleLabel } from '../../shared/recurring'
import { ReactionSummary } from './Reactions'

/** 分解のグループ (元タスク + 子タスク) ごとの色相。グループでなければ null */
export function groupHue(task: Pick<Task, 'id' | 'parent' | 'children'>) {
  const key = task.parent?.id ?? (task.children?.total ? task.id : null)
  if (!key) return null
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** 獲得 XP の見込み (完了済みなら獲得した XP) */
export function XpChip({ task }: { task: Task }) {
  if (task.status === 'done') {
    return task.xpAwarded ? <span className="xp-chip done">+{task.xpAwarded}XP</span> : null
  }
  const xp = baseXp(task)
  if (task.children?.total) return <span className="xp-chip split">XPは子タスクへ</span>
  const label = task.parent ? '分配' : WEIGHT_LABEL[task.weight ?? 'M']
  return (
    <span className={`xp-chip w-${task.parent ? 'split' : (task.weight ?? 'M')}`} data-testid="xp-chip" title={task.weight ? (task.weightAi && task.weight !== task.weightAi ? '本人が調整' : '') : 'AI判定前 (中として計算)'}>
      {label} +{xp}XP
    </span>
  )
}

/** 重要度 (普通のときは出さない。compact ではカードを詰めるため「低」も出さない) */
export function PriorityBadge({ task, compact = false }: { task: Pick<Task, 'priority' | 'status'>; compact?: boolean }) {
  if (!task.priority || task.status === 'done' || (compact && task.priority === 'low')) return null
  return (
    <span className={`prio-chip p-${task.priority}`} data-testid="prio-chip">
      {task.priority === 'high' ? '重要度 高' : '重要度 低'}
    </span>
  )
}

/**
 * 重要度・子タスクの進み具合・フラグ・依頼のつながり。
 * compact (カード用) では、すぐ動く必要のあるものだけを目立たせ、繰り返し・コメントは小さなアイコンにする
 */
export function TaskLinks({ task, showFlagNote = false, compact = false }: { task: Task; showFlagNote?: boolean; compact?: boolean }) {
  const f = task.flag
  return (
    <>
      <PriorityBadge task={task} compact={compact} />
      <ReactionSummary task={task} />
      {task.recurring && (
        <span className={`recur-chip ${compact ? 'mini' : ''}`} data-testid="recur-chip" title={ruleLabel(task.recurring.rule)}>
          🔁{compact ? '' : ` ${ruleLabel(task.recurring.rule)}`}
        </span>
      )}
      {!!task.comments && (
        <span className={`comment-chip ${compact ? 'mini' : ''}`} data-testid="comment-chip">
          💬{task.comments}
        </span>
      )}
      {task.children?.total ? (
        <span className="kids-chip" data-testid="kids-chip">
          <span className="kids-bar">
            <span style={{ transform: `scaleX(${task.children.done / task.children.total})` }} />
          </span>
          {task.children.done}/{task.children.total}
        </span>
      ) : null}
      {f && (
        <span className={`flag-chip f-${f.kind}`} data-testid="flag-chip">
          {FLAGS[f.kind].icon} {FLAGS[f.kind].label}
          {f.to ? ` → ${f.to.name}` : ''}
          {showFlagNote && f.note ? `：${f.note}` : ''}
        </span>
      )}
      {task.requestedBy && (
        <span className="req-chip" data-testid="req-chip">
          📨 {san(task.requestedBy.name)}から
        </span>
      )}
      {task.waitingOn && (
        <span className={`wait-chip ${task.waitingOn.status === 'done' ? 'ok' : ''}`} data-testid="wait-chip">
          {task.waitingOn.status === 'done' ? `✅ ${san(task.waitingOn.owner.name)}完了` : `⏳ ${san(task.waitingOn.owner.name)}の「${task.waitingOn.title}」待ち`}
        </span>
      )}
    </>
  )
}
