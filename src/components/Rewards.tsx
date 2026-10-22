import { AnimatePresence, motion } from 'motion/react'

export interface XpPopData {
  id: number
  amount: number
  gold: number
  bonuses: string[]
}

/** 完了時に浮かび上がる「+20 XP」 */
export function XpPops({ pops }: { pops: XpPopData[] }) {
  return (
    <div className="xp-zone" aria-live="polite">
      <AnimatePresence>
        {pops.map((p) => (
          <motion.div
            key={p.id}
            className={`xp-pop ${p.amount < 0 ? 'neg' : ''}`}
            data-testid="xp-pop"
            initial={{ opacity: 0, y: 12, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.28 }}
          >
            <b>
              {p.amount > 0 ? '+' : ''}
              {p.amount} XP
              {p.gold !== 0 && (
                <em>
                  {' '}
                  {p.gold > 0 ? '+' : ''}
                  {p.gold} G
                </em>
              )}
            </b>
            {p.bonuses.length > 0 && <span>{p.bonuses.join(' ・ ')}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export interface Celebration {
  label: string
  title: string
  sub: string
}

/** レベルアップ・上位職解放などのお祝い */
export function LevelUp({ data, onClose, onGo }: { data: Celebration; onClose: () => void; onGo: () => void }) {
  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="levelup glass"
        role="dialog"
        data-testid="levelup"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      >
        <div className="lu-label">{data.label}</div>
        <div className="lu-level">{data.title}</div>
        <div className="lu-sp">{data.sub}</div>
        <div className="lu-actions">
          <button className="pill-btn ghost" onClick={onClose}>
            閉じる
          </button>
          <button className="pill-btn primary" onClick={onGo} data-testid="levelup-go">
            冒険へ
          </button>
        </div>
      </motion.div>
    </>
  )
}
