import { motion } from 'motion/react'
import { WHATS_NEW, type WhatsNewAction } from '../../shared/whatsnew'

/** 「新しくなったこと」: 更新のあと最初に開いたときに一度だけ出す (メニューからいつでも見られる) */
export function WhatsNew({ simple, onAction, onClose }: { simple: boolean; onAction: (a: WhatsNewAction) => void; onClose: () => void }) {
  // シンプル表示の人には冒険の話は出さない
  const items = WHATS_NEW.filter((w) => !(simple && w.game))
  return (
    <>
      <motion.div className="scrim top" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="guide glass whats-new"
        role="dialog"
        aria-label="新しくなったこと"
        data-testid="whats-new"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
      >
        <h2>✨ 新しくなったこと</h2>
        <p className="muted">最近できるようになったことです。気になるものは「試す」から開けます。</p>
        <ul className="wn-list">
          {items.map((w) => (
            <li key={w.title}>
              <span className="wn-icon">{w.icon}</span>
              <span className="wn-body">
                <b>{w.title}</b>
                <span>{w.desc}</span>
              </span>
              {w.action && (
                <button className="pill-btn ghost small" onClick={() => onAction(w.action!)} data-testid={`wn-${w.action}`}>
                  {w.button ?? '試す'}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button className="pill-btn primary" onClick={onClose} data-testid="whats-new-close">
          OK
        </button>
      </motion.div>
    </>
  )
}
