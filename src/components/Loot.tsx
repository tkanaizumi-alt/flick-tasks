import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { EFFECTS, RARITY_SELL, SLOTS, type Item } from '../../shared/game'

const statText = (i: Pick<Item, 'atk' | 'hp' | 'crit' | 'heal'>) =>
  [i.atk && `攻撃+${i.atk}`, i.hp && `体力+${i.hp}`, i.crit && `会心+${i.crit}%`, i.heal && `回復+${i.heal}`].filter(Boolean).join(' ')

export function ItemCard({ item, equipped, onClick }: { item: Item; equipped?: boolean; onClick?: () => void }) {
  return (
    <button className={`item-card r-${item.rarity} ${equipped ? 'eq' : ''}`} onClick={onClick} data-testid="item">
      <span className="item-rarity">{item.rarity}</span>
      <span className="item-icon">{item.icon}</span>
      <span className="item-name">{item.name}</span>
      {item.effect && <span className="item-fx">✦</span>}
      {equipped && <span className="item-eq">E</span>}
    </button>
  )
}

/** 宝箱を開ける演出: 揺れる → 開く → レア度の光とともに中身 */
export function ChestReveal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), item.rarity === 'SSR' ? 1100 : 700)
    return () => clearTimeout(t)
  }, [item.rarity])
  return (
    <>
      <motion.div className="scrim" onClick={open ? onClose : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="reveal" data-testid="chest-reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        {!open ? (
          <div className={`chest-shake ${item.rarity === 'SSR' || item.rarity === 'SR' ? 'rare' : ''}`} onClick={() => setOpen(true)}>
            🎁
          </div>
        ) : (
          <div className={`reveal-card glass r-${item.rarity}`} data-testid="reveal-card">
            <div className="rays" aria-hidden="true" />
            <div className="reveal-rarity">{item.rarity}</div>
            <div className="reveal-icon">{item.icon}</div>
            <div className="reveal-name">{item.name}</div>
            <div className="reveal-slot">{SLOTS.find((s) => s.key === item.slot)?.label}</div>
            <div className="reveal-stats">{statText(item)}</div>
            {item.effect && <div className="reveal-fx">✦ {EFFECTS[item.effect]}</div>}
            <button className="pill-btn primary" onClick={onClose} data-testid="reveal-close">
              OK
            </button>
          </div>
        )}
      </motion.div>
    </>
  )
}

interface SheetProps {
  item: Item
  equipped: boolean
  current: Item | null
  busy: boolean
  onClose: () => void
  onEquip: (on: boolean) => void
  onSell: () => void
}

/** アイテムの詳細と 装備 / 外す / 売る */
export function ItemSheet({ item, equipped, current, busy, onClose, onEquip, onSell }: SheetProps) {
  const diff = (k: 'atk' | 'hp' | 'crit' | 'heal') => item[k] - (current && current.id !== item.id ? current[k] : 0)
  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass item-sheet"
        data-testid="item-sheet"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      >
        <div className="grab-zone">
          <div className="grabber" />
        </div>
        <div className={`is-head r-${item.rarity}`}>
          <span className="is-icon">{item.icon}</span>
          <div>
            <div className="is-name">
              <span className="item-rarity inline">{item.rarity}</span> {item.name}
            </div>
            <div className="muted">{SLOTS.find((s) => s.key === item.slot)?.label}</div>
          </div>
        </div>
        <ul className="is-stats">
          {(['atk', 'hp', 'crit', 'heal'] as const)
            .filter((k) => item[k] || (current && current[k]))
            .map((k) => {
              const d = diff(k)
              return (
                <li key={k}>
                  <span>{{ atk: '攻撃', hp: '体力', crit: '会心', heal: '回復' }[k]}</span>
                  <b>+{item[k]}</b>
                  {!equipped && current && d !== 0 && <em className={d > 0 ? 'up' : 'down'}>{d > 0 ? `▲${d}` : `▼${-d}`}</em>}
                </li>
              )
            })}
        </ul>
        {item.effect && <p className="is-fx">✦ {EFFECTS[item.effect]}</p>}
        <div className="sheet-actions">
          <button className="pill-btn primary grow" disabled={busy} onClick={() => onEquip(!equipped)} data-testid="equip-toggle">
            {equipped ? '外す' : '装備する'}
          </button>
          <button className="pill-btn ghost" disabled={busy || equipped} onClick={onSell} data-testid="sell">
            売る 💰{RARITY_SELL[item.rarity]}
          </button>
        </div>
      </motion.div>
    </>
  )
}
