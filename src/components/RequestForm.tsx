import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { san, type Person, type Task } from '../../shared/types'
import { jstToday } from '../../shared/game'
import { api, HttpError } from '../api'

const tomorrow = () => new Date(Date.parse(`${jstToday()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

/** 他の人へのタスクの依頼。相手のリストに入り、完了すると自分に通知が届く */
export function RequestForm({
  to: initialTo,
  onClose,
  onDone,
  toast,
}: {
  to?: string
  onClose: () => void
  onDone: () => void
  toast?: (text: string) => void
}) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [mine, setMine] = useState<Task[]>([])
  const [to, setTo] = useState<string | null>(initialTo ?? null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const [follow, setFollow] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.people().then((r) => setPeople(r.people.filter((p) => !p.isMe)), () => setPeople([]))
    api.list().then((r) => setMine(r.tasks.filter((t) => t.status !== 'done')), () => {})
  }, [])

  const submit = async () => {
    if (!to || !title.trim()) return
    setSaving(true)
    try {
      await api.request({ to, title: title.trim(), note, due: due || null, followId: follow || null })
      toast?.(`${san(people?.find((p) => p.id === to)?.name ?? '')}に依頼しました`)
      onDone()
      onClose()
    } catch (e) {
      toast?.(e instanceof HttpError && e.reason ? e.reason : '依頼できませんでした')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div className="scrim top" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.form
        className="guide glass request-form"
        role="dialog"
        aria-label="タスクを依頼"
        data-testid="request-form"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2>タスクを依頼</h2>
        <label className="field-label">だれに</label>
        <div className="who-row">
          {people === null ? (
            <span className="muted">読み込み中…</span>
          ) : (
            people.map((p) => (
              <button type="button" key={p.id} className={`who ${to === p.id ? 'on' : ''}`} onClick={() => setTo(p.id)} data-testid="req-to">
                {p.name}
              </button>
            ))
          )}
        </div>
        <label className="field-label">依頼する内容</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} placeholder="例: 見積書の金額を確認" data-testid="req-title" autoFocus />
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={5000} placeholder="詳細（任意）" data-testid="req-note" />
        <label className="field-label">期限（任意）</label>
        <div className="range-row">
          <input type="date" value={due} min={jstToday()} onChange={(e) => setDue(e.target.value)} data-testid="req-due" />
          <button type="button" className="due-chip" onClick={() => setDue(jstToday())}>
            今日
          </button>
          <button type="button" className="due-chip" onClick={() => setDue(tomorrow())}>
            明日
          </button>
        </div>
        <label className="field-label">終わったら進める自分のタスク（任意）</label>
        <select value={follow} onChange={(e) => setFollow(e.target.value)} data-testid="req-follow">
          <option value="">なし</option>
          {mine.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <p className="muted">相手が完了すると、あなたに通知が届きます。</p>
        <div className="sheet-actions">
          <button type="button" className="pill-btn ghost" onClick={onClose}>
            やめる
          </button>
          <button type="submit" className="pill-btn primary grow" disabled={saving || !to || !title.trim()} data-testid="req-submit">
            依頼する
          </button>
        </div>
      </motion.form>
    </>
  )
}
