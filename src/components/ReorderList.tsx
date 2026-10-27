import { useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import type { Task } from '../../shared/types'
import { DueBadge } from './DueBadge'
import { PriorityBadge } from './TaskMeta'

/**
 * ドラッグで並べ替える一覧 (並べ替えモード中だけ使う)。
 * 依頼されたタスクは一番上に固定のまま動かさない
 */
export function ReorderList({ tasks, onChange }: { tasks: Task[]; onChange: (ids: string[]) => void }) {
  const fixed = tasks.filter((t) => t.requestedBy)
  const [order, setOrder] = useState(() => tasks.filter((t) => !t.requestedBy))
  return (
    <>
      {fixed.length > 0 && (
        <ul className="list reorder-fixed">
          {fixed.map((t) => (
            <li key={t.id} className="card card-surface reorder-card fixed">
              <span className="reorder-pin">📌</span>
              <span className="reorder-title">{t.title}</span>
              <span className="muted">依頼は上に固定</span>
            </li>
          ))}
        </ul>
      )}
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={(next: Task[]) => {
          setOrder(next)
          onChange([...fixed, ...next].map((t) => t.id))
        }}
        className="list reorder-list"
        data-testid="reorder-list"
      >
        {order.map((t) => (
          <Row key={t.id} task={t} />
        ))}
      </Reorder.Group>
    </>
  )
}

function Row({ task }: { task: Task }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={task} dragListener={false} dragControls={controls} className="card card-surface reorder-card" data-testid="reorder-item" whileDrag={{ scale: 1.03, boxShadow: '0 16px 32px -12px rgba(20,28,48,0.35)' }}>
      <span className="reorder-handle" onPointerDown={(e) => controls.start(e)} aria-label="ドラッグして並べ替え" data-testid="reorder-handle">
        ≡
      </span>
      <span className="reorder-title">{task.title}</span>
      <PriorityBadge task={task} />
      <DueBadge task={task} />
    </Reorder.Item>
  )
}
