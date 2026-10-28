import { motion } from 'motion/react'

export type ViewMode = 'mobile' | 'pc' | 'calendar'
const MODE_LABEL: Record<ViewMode, [string, string, string]> = {
  mobile: ['📱', 'スマホ', 'スマホ用の見え方'],
  pc: ['💻', 'PC', 'PC用の見え方'],
  calendar: ['📅', 'カレンダー', '期限のあるタスクをカレンダーで見る'],
}

/**
 * その画面の見え方の切り替え (📱 スマホ / 💻 PC / 📅 カレンダー)。
 * modes で出す選択肢を決める (狭い画面では PC を出さない、カレンダーは「自分」だけ)。狭い画面では絵文字だけ
 */
export function LayoutToggle({ mode, onChange, label, modes = ['mobile', 'pc'] }: { mode: ViewMode; onChange: (mode: ViewMode) => void; label: string; modes?: ViewMode[] }) {
  return (
    <div className="layout-toggle glass" role="radiogroup" aria-label={`${label}の見え方`} data-testid="layout-toggle">
      {modes.map((m) => {
        const on = m === mode
        const [icon, text, title] = MODE_LABEL[m]
        return (
          <button key={m} role="radio" aria-checked={on} aria-label={text} className={`lt-btn ${on ? 'on' : ''}`} onClick={() => onChange(m)} title={title} data-testid={`layout-${m}`}>
            {on && <motion.span layoutId={`lt-pill-${label}`} className="lt-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span className="lt-label">
              {icon}
              <span className="lt-text"> {text}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** はじめての人への案内 (メンバーごとに 1 回) */
export function LayoutGuide({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div className="scrim top" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="guide glass"
        role="dialog"
        aria-label="見え方の切り替え"
        data-testid="layout-guide"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
      >
        <h2>見え方を切り替えられます</h2>
        <p>
          画面の右上の <b>📱 スマホ / 💻 PC</b> で、見え方を選べます。
        </p>
        <ul>
          <li>「自分」「みんな」「冒険」の画面ごとに、別々に選べます（例: 自分はPCの3列、冒険はスマホ表示）</li>
          <li>PC表示: 自分は未着手・進行中・完了の3列、みんな・冒険はパネルを横に並べて一覧しやすく</li>
          <li>選んだ見え方は、このブラウザで次からも使われます</li>
        </ul>
        <button className="pill-btn primary" onClick={onClose} data-testid="layout-guide-ok">
          OK
        </button>
      </motion.div>
    </>
  )
}
