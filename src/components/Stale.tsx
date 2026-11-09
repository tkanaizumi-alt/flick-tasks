import { useEffect, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { STALE_DAYS, idleDays, type Task } from '../../shared/types'
import { jstToday } from '../../shared/game'

/** 自分の画面の上に出す「しばらく動いていないタスク」のお知らせ (本人にだけ見える) */
export function StaleBar({ count, onOpen, onHide }: { count: number; onOpen: () => void; onHide: () => void }) {
  return (
    <div className="stale-bar" data-testid="stale-bar">
      <span>
        🕰️ {STALE_DAYS}日以上動いていないタスクが <b>{count}件</b>
      </span>
      <button className="pill-btn primary small" onClick={onOpen} data-testid="stale-open">
        見直す
      </button>
      <button className="stale-hide" onClick={onHide} aria-label="1週間表示しない" title="1週間表示しない" data-testid="stale-hide">
        ×
      </button>
    </div>
  )
}

interface Props<T extends Task> {
  tasks: T[]
  onClose: () => void
  /** まだやる (最後に触った日を今日に) */
  onKeep: (t: T) => void
  onDue: (t: T, due: string) => void
  /** 詳細を開く (分解・メモの追記など) */
  onOpen: (t: T) => void
  /** やめる (削除。元に戻せる) */
  onDrop: (t: T) => void
}

/** 動いていないタスクの見直し: 1 件ずつ「まだやる / 期限を付ける / 開く / やめる」を選ぶ */
export function StaleSheet<T extends Task>({ tasks, onClose, onKeep, onDue, onOpen, onDrop }: Props<T>) {
  const controls = useDragControls()
  const [dueFor, setDueFor] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // 全部見直したら閉じる
  useEffect(() => {
    if (!tasks.length) onClose()
  }, [tasks.length, onClose])

  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass tool-sheet stale-sheet"
        role="dialog"
        aria-label="動いていないタスクの見直し"
        data-testid="stale-sheet"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose()
        }}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>
        <h2 className="sheet-h">🕰️ 動いていないタスクの見直し</h2>
        <p className="muted">
          {STALE_DAYS}日以上さわっていないタスクです（期限つき・繰り返しは除く）。この画面はあなたにだけ見えています。1件ずつ、どうするか選んでください。
        </p>
        <ul className="stale-list">
          {tasks.map((t) => (
            <li key={t.id} className="stale-item" data-testid="stale-item">
              <div className="stale-head">
                <b className="stale-title">{t.title}</b>
                <span className="muted">{idleDays(t)}日動きなし</span>
              </div>
              {dueFor === t.id ? (
                <div className="stale-due">
                  <input
                    type="date"
                    min={jstToday()}
                    autoFocus
                    aria-label="期限"
                    data-testid="stale-due-input"
                    onChange={(e) => {
                      if (!e.target.value) return
                      onDue(t, e.target.value)
                      setDueFor(null)
                    }}
                  />
                  <button className="pill-btn ghost small" onClick={() => setDueFor(null)}>
                    やめる
                  </button>
                </div>
              ) : (
                <div className="stale-actions">
                  <button className="pill-btn ghost small" onClick={() => onKeep(t)} data-testid="stale-keep">
                    👍 まだやる
                  </button>
                  <button className="pill-btn ghost small" onClick={() => setDueFor(t.id)} data-testid="stale-due">
                    📅 期限を付ける
                  </button>
                  <button className="pill-btn ghost small" onClick={() => onOpen(t)} data-testid="stale-detail">
                    ✏️ 開く・分解
                  </button>
                  <button className="pill-btn ghost small danger-text" onClick={() => onDrop(t)} data-testid="stale-drop">
                    🗑️ やめる
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </motion.div>
    </>
  )
}
