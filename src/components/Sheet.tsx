import { useEffect, useRef, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { STATUSES, type Status } from '../../shared/types'
import type { UITask } from '../App'
import { STATUS_LABEL } from '../api'
import { SparkIcon, TrashIcon } from './icons'
import { DueField } from './DueField'

interface Props {
  task: UITask
  onClose: (patch: { title?: string; note?: string }) => void
  onStatus: (s: Status) => void
  onDelete: () => void
  onBreakdown: (title: string, note: string) => Promise<void>
  onDue: (due: string | null) => void
}

export function Sheet({ task, onClose, onStatus, onDelete, onBreakdown, onDue }: Props) {
  const [title, setTitle] = useState(task.title)
  const [note, setNote] = useState(task.note)
  const [busy, setBusy] = useState(false)
  const controls = useDragControls()
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const close = () => {
    const patch: { title?: string; note?: string } = {}
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim()
    if (note !== task.note) patch.note = note
    onClose(patch)
  }

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <motion.div
        className="scrim"
        onClick={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
      <motion.div
        className="sheet glass"
        role="dialog"
        aria-label="タスク"
        data-testid="sheet"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) close()
        }}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>

        <textarea
          ref={titleRef}
          className="sheet-title"
          value={title}
          rows={1}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="タイトル"
          data-testid="sheet-title"
        />
        <textarea className="sheet-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="詳細" rows={3} aria-label="詳細" />

        <DueField due={task.due ?? null} dueBy={task.dueBy?.name} onChange={onDue} />

        <div className="seg" role="radiogroup">
          {STATUSES.map((s) => (
            <button key={s} role="radio" aria-checked={task.status === s} className={`seg-btn t-${s} ${task.status === s ? 'on' : ''}`} onClick={() => onStatus(s)} data-testid={`sheet-status-${s}`}>
              {task.status === s && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}
              <span>{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>

        <div className="sheet-actions">
          <motion.button
            className={`pill-btn ai ${busy ? 'busy' : ''}`}
            whileTap={{ scale: 0.95 }}
            disabled={busy}
            data-testid="breakdown"
            onClick={async () => {
              setBusy(true)
              try {
                await onBreakdown(title.trim() || task.title, note)
              } finally {
                setBusy(false)
              }
            }}
          >
            <SparkIcon />
            <span>{busy ? '分解中' : 'AIで分解'}</span>
          </motion.button>
          <motion.button className="pill-btn danger" whileTap={{ scale: 0.95 }} onClick={onDelete} data-testid="sheet-delete" aria-label="削除">
            <TrashIcon />
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
