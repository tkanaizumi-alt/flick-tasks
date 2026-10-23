import { jstToday } from '../../shared/game'

interface Props {
  due: string | null
  /** 期限を設定した人 (自分以外のとき) */
  dueBy?: string
  onChange: (due: string | null) => void
  disabled?: boolean
  compact?: boolean
}

/** 期限の入力欄 (日付ピッカー + 今日 / 明日 のショートカット + 解除) */
export function DueField({ due, dueBy, onChange, disabled, compact }: Props) {
  const today = jstToday()
  const tomorrow = jstToday(Date.now() + 86400000)
  return (
    <div className={`due-field ${compact ? 'compact' : ''}`}>
      {!compact && <span className="due-label">⏰ 期限</span>}
      <input
        type="date"
        value={due ?? ''}
        min="2000-01-01"
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        aria-label="期限"
        data-testid="due-input"
      />
      <button type="button" className="due-chip" disabled={disabled} onClick={() => onChange(today)} data-testid="due-today">
        今日
      </button>
      <button type="button" className="due-chip" disabled={disabled} onClick={() => onChange(tomorrow)}>
        明日
      </button>
      {due && (
        <button type="button" className="due-chip clear" disabled={disabled} onClick={() => onChange(null)} aria-label="期限を解除" data-testid="due-clear">
          解除
        </button>
      )}
      {due && dueBy && <span className="due-by">{dueBy}さんが設定</span>}
    </div>
  )
}
