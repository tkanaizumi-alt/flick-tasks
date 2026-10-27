import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { STATUSES, type Status } from '../../shared/types'
import { STATUS_LABEL } from '../api'
import { CheckIcon, SearchIcon, XIcon } from './icons'

interface Props {
  tab: Status
  counts: Record<Status, number>
  onChange: (s: Status) => void
  /** null = 検索を閉じている */
  query: string | null
  onQuery: (q: string | null) => void
  onStartSelect: () => void
  /** 右端に足すもの (見え方の切り替えなど) */
  extra?: ReactNode
}

/** 自分の画面上部: ステータス切り替え / 検索 / 選択 */
export function MeToolbar({ tab, counts, onChange, query, onQuery, onStartSelect, extra }: Props) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (query !== null) input.current?.focus()
  }, [query !== null])

  return (
    <div className="me-toolbar">
      {query === null ? (
        <div className="status-tabs glass" role="tablist">
          {STATUSES.map((s) => {
            const on = tab === s
            return (
              <button key={s} role="tab" aria-selected={on} data-testid={`tab-${s}`} className={`stab t-${s} ${on ? 'on' : ''}`} onClick={() => onChange(s)}>
                {on && <motion.span layoutId="stab-pill" className="stab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <span className="stab-label">{STATUS_LABEL[s]}</span>
                <span className="stab-count" data-testid={`count-${s}`}>
                  {counts[s]}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <label className="search-box glass">
          <SearchIcon />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onQuery(null)}
            placeholder="タスクを検索"
            aria-label="タスクを検索"
            data-testid="search-input"
            enterKeyHint="search"
          />
        </label>
      )}
      <button
        className="tool-btn glass"
        aria-label={query === null ? '検索' : '検索を閉じる'}
        data-testid="search-toggle"
        onClick={() => onQuery(query === null ? '' : null)}
      >
        {query === null ? <SearchIcon /> : <XIcon />}
      </button>
      <button className="tool-btn glass" aria-label="選択" data-testid="select-start" onClick={onStartSelect}>
        <CheckIcon />
      </button>
      {extra}
    </div>
  )
}
