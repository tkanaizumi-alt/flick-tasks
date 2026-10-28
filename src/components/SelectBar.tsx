import { motion } from 'motion/react'
import type { Status } from '../../shared/types'
import { STATUS_LABEL } from '../api'
import { CheckIcon, TrashIcon, XIcon } from './icons'

const ORDER: Status[] = ['todo', 'doing', 'done']

interface Props {
  count: number
  total: number
  /** 選択中タスクのステータス (1 種類ならそのステータス、混在なら null) */
  status: Status | null
  onAll: () => void
  onCancel: () => void
  onMove: (dir: 1 | -1) => void
  onDelete: () => void
  /** どのステータスからでもまとめて完了 */
  onDone: () => void
  canDone: boolean
  /** 選んだタスクからテンプレートを作る */
  onTemplate: () => void
}

/** 選択モード中、下のタブの代わりに出す操作バー */
export function SelectBar({ count, total, status, onAll, onCancel, onMove, onDelete, onDone, canDone, onTemplate }: Props) {
  const i = status ? ORDER.indexOf(status) : -1
  const prev = status === null ? '前へ' : i > 0 ? `${STATUS_LABEL[ORDER[i - 1]]}へ` : null
  const next = status === null ? '次へ' : i < ORDER.length - 1 ? `${STATUS_LABEL[ORDER[i + 1]]}へ` : null
  return (
    <motion.div
      className="select-bar glass"
      data-testid="select-bar"
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      <div className="sb-top">
        <button className="sb-icon" onClick={onCancel} aria-label="選択をやめる" data-testid="select-cancel">
          <XIcon />
        </button>
        <span className="sb-count" data-testid="select-count">
          {count}件を選択
        </span>
        <button className="sb-link" onClick={onAll} data-testid="select-all">
          {count === total ? '選択を解除' : 'すべて選択'}
        </button>
      </div>
      <div className="sb-actions">
        {prev && (
          <button className="sb-btn" disabled={!count} onClick={() => onMove(-1)} data-testid="bulk-prev">
            ← {prev}
          </button>
        )}
        {next && next !== '完了へ' && (
          <button className="sb-btn" disabled={!count} onClick={() => onMove(1)} data-testid="bulk-next">
            {next} →
          </button>
        )}
        {status !== 'done' && (
          <button className="sb-btn primary done" disabled={!count || !canDone} onClick={onDone} data-testid="bulk-done">
            <CheckIcon /> 完了
          </button>
        )}
        <button className="sb-btn" disabled={!count} onClick={onTemplate} aria-label="テンプレートにする" title="テンプレートにする" data-testid="bulk-template">
          📋
        </button>
        <button className="sb-btn danger" disabled={!count} onClick={onDelete} aria-label="削除" data-testid="bulk-delete">
          <TrashIcon />
        </button>
      </div>
    </motion.div>
  )
}
