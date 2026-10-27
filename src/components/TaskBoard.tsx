import type { ReactNode } from 'react'
import { AnimatePresence, LayoutGroup } from 'motion/react'
import type { Status } from '../../shared/types'
import type { UITask } from '../App'
import { STATUS_LABEL } from '../api'
import { TaskCard } from './TaskCard'
import { ReorderList } from './ReorderList'
import { CheckCircleIcon, CircleIcon, PlayIcon } from './icons'

const ORDER: Status[] = ['todo', 'doing', 'done']
const EMPTY_ICON = { todo: CircleIcon, doing: PlayIcon, done: CheckCircleIcon }

interface Props {
  /** PC 表示: 未着手・進行中・完了を 3 列で並べる */
  board: boolean
  tasks: UITask[]
  tab: Status
  /** 検索中 (全ステータスを混ぜて出す) */
  searching: boolean
  /** 並べ替えモード中なら、ステータスごとの新しい並びを受け取る */
  reordering: boolean
  onReorder: (status: Status, ids: string[]) => void
  selected: Set<string> | null
  onSwipe: (task: UITask, dir: 1 | -1) => void
  onOpen: (task: UITask) => void
  onSelect: (task: UITask) => void
  /** 完了の並び順の切り替え */
  doneSortRow: ReactNode
  onHistory: () => void
}

/** 自分のタスクの一覧 (スマホ: 今のタブだけ / PC: 3 列) */
export function TaskBoard({ board, tasks, tab, searching, reordering, onReorder, selected, onSwipe, onOpen, onSelect, doneSortRow, onHistory }: Props) {
  const historyLink = (
    <button className="history-link" onClick={onHistory} data-testid="history-open">
      📒 7日より前の完了・エクスポート・AI日報は「履歴」へ
    </button>
  )
  const cards = (list: UITask[], showStatus = false) => (
    <AnimatePresence mode="popLayout">
      {list.map((t, i) => (
        <TaskCard key={t.id} task={t} index={i} onSwipe={onSwipe} onOpen={onOpen} selecting={!!selected} selected={!!selected?.has(t.id)} onSelect={onSelect} showStatus={showStatus} />
      ))}
    </AnimatePresence>
  )

  if (board) {
    return (
      <LayoutGroup>
        <div className="board-cols" data-testid="board">
          {ORDER.map((s) => {
            const col = tasks.filter((t) => t.status === s)
            const Icon = EMPTY_ICON[s]
            return (
              <section key={s} className={`board-col t-${s}`}>
                <h2 className="board-col-head">
                  {STATUS_LABEL[s]} <span>{col.length}</span>
                </h2>
                {s === 'done' && col.length > 1 && doneSortRow}
                {reordering && s !== 'done' ? (
                  <ReorderList tasks={col} onChange={(ids) => onReorder(s, ids)} />
                ) : (
                  <ul className="list" data-testid={`list-${s}`}>
                    {cards(col)}
                  </ul>
                )}
                {col.length === 0 && (
                  <div className={`board-empty t-${s}`}>
                    <Icon />
                  </div>
                )}
                {s === 'done' && historyLink}
              </section>
            )
          })}
        </div>
      </LayoutGroup>
    )
  }

  const EmptyIcon = EMPTY_ICON[tab]
  return (
    <section className="list-page">
      {reordering && tab !== 'done' ? (
        <ReorderList tasks={tasks} onChange={(ids) => onReorder(tab, ids)} />
      ) : (
        <LayoutGroup>
          <ul className="list" data-testid={`list-${tab}`}>
            {cards(tasks, searching)}
          </ul>
        </LayoutGroup>
      )}
      {tasks.length === 0 && (
        <div className={`empty t-${tab}`} data-testid="empty">
          {searching ? <span className="empty-text">見つかりません</span> : <EmptyIcon />}
        </div>
      )}
      {tab === 'done' && !searching && historyLink}
    </section>
  )
}
