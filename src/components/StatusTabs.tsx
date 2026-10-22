import { motion } from 'motion/react'
import { STATUSES, type Status } from '../../shared/types'
import { STATUS_LABEL } from '../api'

interface Props {
  tab: Status
  counts: Record<Status, number>
  onChange: (s: Status) => void
}

/** 自分の画面上部のステータス切り替え */
export function StatusTabs({ tab, counts, onChange }: Props) {
  return (
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
  )
}
