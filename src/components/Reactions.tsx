import { useState } from 'react'
import { REACTIONS, REACTION_MAP, san, type ReactionKind, type Task } from '../../shared/types'
import { api, HttpError } from '../api'

/** 種類ごとに、付けた人の一覧 (付いているものだけ、決まった順) */
const grouped = (task: Pick<Task, 'reactions'>) =>
  REACTIONS.map((r) => ({ ...r, users: (task.reactions ?? []).filter((x) => x.kind === r.kind).map((x) => x.user) })).filter((r) => r.users.length)

/** カード用: 付いているリアクションを小さく (👍2 🎉1)。押しても何もしない */
export function ReactionSummary({ task }: { task: Pick<Task, 'reactions'> }) {
  const list = grouped(task)
  if (!list.length) return null
  return (
    <span className="react-sum" data-testid="react-sum" title={list.map((r) => `${r.emoji} ${r.users.map((u) => san(u.name)).join('、')}`).join(' / ')}>
      {list.map((r) => (
        <span key={r.kind}>
          {r.emoji}
          {r.users.length > 1 ? r.users.length : ''}
        </span>
      ))}
    </span>
  )
}

/** 自分のタスクの詳細用: だれがどのリアクションをくれたか */
export function ReactionList({ task }: { task: Pick<Task, 'reactions'> }) {
  const list = grouped(task)
  if (!list.length) return null
  return (
    <div className="react-list" data-testid="react-list">
      {list.map((r) => (
        <span key={r.kind} className="react-who">
          <b>
            {r.emoji} {r.label}
          </b>
          {r.users.map((u) => san(u.name)).join('、')}
        </span>
      ))}
    </div>
  )
}

/** 他の人のタスクに付ける 5 種類のボタン。もう一度押すと取り消し */
export function ReactionBar<T extends Task>({ task, meId, onChange, toast }: { task: T; meId: string; onChange: (t: T) => void; toast?: (text: string) => void }) {
  const [busy, setBusy] = useState<ReactionKind | null>(null)
  const toggle = async (kind: ReactionKind) => {
    if (busy) return
    const mine = (task.reactions ?? []).some((r) => r.kind === kind && r.user.id === meId)
    // 先に見た目を変える
    const optimistic = mine ? (task.reactions ?? []).filter((r) => !(r.kind === kind && r.user.id === meId)) : [...(task.reactions ?? []), { kind, user: { id: meId, name: '' } }]
    onChange({ ...task, reactions: optimistic })
    setBusy(kind)
    try {
      const r = await api.react(task.id, kind)
      onChange({ ...task, ...r.task })
    } catch (e) {
      onChange(task)
      toast?.(e instanceof HttpError && e.reason ? e.reason : 'リアクションできませんでした')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="react-bar" role="group" aria-label="リアクション" data-testid="react-bar">
      {REACTIONS.map((r) => {
        const users = (task.reactions ?? []).filter((x) => x.kind === r.kind)
        const on = users.some((x) => x.user.id === meId)
        return (
          <button
            key={r.kind}
            className={`react-btn ${on ? 'on' : ''}`}
            aria-pressed={on}
            title={users.length ? `${r.label}: ${users.map((x) => san(x.user.name || 'あなた')).join('、')}` : r.label}
            onClick={() => toggle(r.kind)}
            data-testid={`react-${r.kind}`}
          >
            <span className="react-emoji">{REACTION_MAP[r.kind].emoji}</span>
            {users.length > 0 ? <b>{users.length}</b> : <span className="react-label">{r.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
