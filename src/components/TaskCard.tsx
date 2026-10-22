import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type Variants } from 'motion/react'
import type { Status } from '../../shared/types'
import { doneDaysLeft } from '../../shared/game'
import { STATUS_LABEL } from '../api'
import type { UITask } from '../App'
import { CheckIcon, PlayIcon, SparkIcon, TrashIcon, UndoIcon, CloudIcon } from './icons'

/** フリックで確定したカードの飛ばす方向 (exit アニメーション用) */
export const exitDir = new Map<string, number>()

interface Action {
  label: string
  color: string
  icon: ReactNode
}

const ORDER: Status[] = ['todo', 'doing', 'done']
const DELETE: Action = { label: '削除', color: 'linear-gradient(135deg,#ff7a8a,#ff4d6a)', icon: <TrashIcon /> }
const TO: Record<Status, Action> = {
  todo: { label: '未着手', color: 'linear-gradient(135deg,#9aa6c4,#7381a6)', icon: <UndoIcon /> },
  doing: { label: '進行中', color: 'linear-gradient(135deg,#ffc35c,#ff9f2e)', icon: <PlayIcon /> },
  done: { label: '完了', color: 'linear-gradient(135deg,#4ee3a5,#16c784)', icon: <CheckIcon /> },
}

export function actionFor(status: Status, dir: 1 | -1): Action {
  const next = ORDER.indexOf(status) + dir
  return next < 0 || next >= ORDER.length ? DELETE : TO[ORDER[next]]
}

const variants: Variants = {
  initial: { opacity: 0, y: -12 },
  animate: ({ i }: { i: number }) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: 'easeOut', delay: i < 6 ? i * 0.03 : 0 },
  }),
  exit: ({ id }: { id: string }) =>
    exitDir.has(id) ? { opacity: 0, transition: { duration: 0.2 } } : { opacity: 0, scale: 0.94, transition: { duration: 0.16 } },
}

interface Props {
  task: UITask
  index: number
  onSwipe: (task: UITask, dir: 1 | -1) => void
  onOpen: (task: UITask) => void
  /** 選択モード中か / このカードが選択中か */
  selecting?: boolean
  selected?: boolean
  onSelect?: (task: UITask) => void
  /** 他の状態のタスクも混ざる検索結果ではステータスを表示する */
  showStatus?: boolean
  ref?: Ref<HTMLLIElement>
}

const LONG_PRESS_MS = 450

export function TaskCard({ task, index, onSwipe, onOpen, selecting, selected, onSelect, showStatus, ref }: Props) {
  const x = useMotionValue(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [armed, setArmed] = useState<0 | 1 | -1>(0)
  const dragged = useRef(false)
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const locked = task.ai || task.syncing
  const daysLeft = task.status === 'done' ? doneDaysLeft(task.doneAt ?? task.updatedAt) : null

  // 長押しで選択モードへ (少しでも動いたらスワイプ扱いで中止)
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.t)
    press.current = null
  }
  const startPress = (e: PointerEvent) => {
    if (selecting || locked || !onSelect) return
    cancelPress()
    press.current = {
      x: e.clientX,
      y: e.clientY,
      t: setTimeout(() => {
        press.current = null
        dragged.current = true
        navigator.vibrate?.(15)
        onSelect(task)
        setTimeout(() => (dragged.current = false), 350)
      }, LONG_PRESS_MS),
    }
  }
  const movePress = (e: PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancelPress()
  }

  useLayoutEffect(() => {
    if (cardRef.current) setWidth(cardRef.current.offsetWidth)
  }, [])

  const threshold = Math.min(width * 0.3, 140)
  const right = actionFor(task.status, 1)
  const left = actionFor(task.status, -1)

  const rightOpacity = useTransform(x, [8, threshold], [0, 1])
  const leftOpacity = useTransform(x, [-threshold, -8], [1, 0])
  const rightIcon = useTransform(x, [0, threshold * 0.7, threshold], [0.4, 0.85, 1.12])
  const leftIcon = useTransform(x, [-threshold, -threshold * 0.7, 0], [1.12, 0.85, 0.4])
  const rotate = useTransform(x, [-width, 0, width], [-5, 0, 5])

  useMotionValueEvent(x, 'change', (v) => {
    const a = v > threshold ? 1 : v < -threshold ? -1 : 0
    if (a !== armed) {
      setArmed(a)
      if (a) navigator.vibrate?.(8)
    }
  })

  return (
    <motion.li
      ref={ref}
      layout
      className="card-wrap"
      custom={{ i: index, id: task.id }}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      data-testid="task"
      data-status={task.status}
    >
      <div className="card-actions" aria-hidden="true">
        <motion.div className={`act act-r ${armed === 1 ? 'armed' : ''}`} style={{ opacity: rightOpacity, background: right.color }}>
          <motion.span className="act-icon" style={{ scale: rightIcon }}>
            {right.icon}
          </motion.span>
          <span className="act-label">{right.label}</span>
        </motion.div>
        <motion.div className={`act act-l ${armed === -1 ? 'armed' : ''}`} style={{ opacity: leftOpacity, background: left.color }}>
          <span className="act-label">{left.label}</span>
          <motion.span className="act-icon" style={{ scale: leftIcon }}>
            {left.icon}
          </motion.span>
        </motion.div>
      </div>

      <motion.div
        ref={cardRef}
        className={`card card-surface s-${task.status} ${task.ai ? 'is-ai' : ''} ${selecting ? 'selecting' : ''} ${selected ? 'selected' : ''}`}
        aria-pressed={selecting ? !!selected : undefined}
        style={{ x, rotate }}
        drag={locked || selecting ? false : 'x'}
        onPointerDown={startPress}
        onPointerMove={movePress}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.92}
        dragTransition={{ bounceStiffness: 520, bounceDamping: 34 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          const v = x.get()
          const vel = info.velocity.x
          let dir: 0 | 1 | -1 = 0
          if (v > threshold || (vel > 700 && v > 36)) dir = 1
          else if (v < -threshold || (vel < -700 && v < -36)) dir = -1
          setTimeout(() => (dragged.current = false), 0)
          if (!dir) return
          exitDir.set(task.id, dir)
          animate(x, dir * (width + 80), { type: 'spring', stiffness: 260, damping: 30, velocity: vel })
          onSwipe(task, dir)
        }}
        onClick={() => {
          if (dragged.current || locked) return
          if (selecting) onSelect?.(task)
          else onOpen(task)
        }}
        role="button"
        tabIndex={0}
        aria-label={task.title}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen(task)
        }}
      >
        {selecting ? (
          <span className={`select-dot ${selected ? 'on' : ''}`} aria-hidden="true">
            {selected ? <CheckIcon /> : null}
          </span>
        ) : (
          <span className="status-dot" aria-hidden="true">
            {task.status === 'done' ? <CheckIcon /> : null}
          </span>
        )}
        <div className="card-body">
          <div className="card-title">{task.title}</div>
          {task.note ? <div className="card-note">{task.note}</div> : null}
          {(showStatus || daysLeft !== null) && (
            <div className="card-meta">
              {showStatus && <span className={`meta-status t-${task.status}`}>{STATUS_LABEL[task.status]}</span>}
              {daysLeft !== null && <span data-testid="days-left">{daysLeft === 0 ? '今日で消えます' : `あと${daysLeft}日で消えます`}</span>}
            </div>
          )}
        </div>
        {task.ai ? (
          <span className="card-badge ai" aria-label="AI処理中">
            <SparkIcon />
          </span>
        ) : task.syncing ? (
          <span className="card-badge sync" aria-label="同期待ち">
            <CloudIcon />
          </span>
        ) : null}
      </motion.div>
    </motion.li>
  )
}
