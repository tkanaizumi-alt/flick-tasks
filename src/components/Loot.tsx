import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { EFFECTS, RARITY_SELL, SLOTS, type Item } from '../../shared/game'
import { PLUS_MAX, enhanceGold, enhanceTo, higherRarity, lowerRarity } from '../../shared/extras'
import { GearIcon } from './GearIcon'

const slotLabel = (i: Pick<Item, 'slot'>) => SLOTS.find((s) => s.key === i.slot)?.label ?? ''
const statText = (i: Pick<Item, 'atk' | 'hp' | 'crit' | 'heal'>) =>
  [i.atk && `攻撃+${i.atk}`, i.hp && `体力+${i.hp}`, i.crit && `会心+${i.crit}%`, i.heal && `回復+${i.heal}`].filter(Boolean).join(' ')

export function ItemCard({ item, equipped, onClick }: { item: Item; equipped?: boolean; onClick?: () => void }) {
  return (
    <button className={`item-card r-${item.rarity} ${equipped ? 'eq' : ''}`} onClick={onClick} data-testid="item" aria-label={`${item.rarity} ${item.name}`}>
      <span className="item-rarity">{item.rarity}</span>
      <GearIcon slot={item.slot} rarity={item.rarity} />
      <span className="item-name">
        {item.name}
        {item.plus ? <b className="item-plus">+{item.plus}</b> : null}
      </span>
      {item.effect && <span className="item-fx">✦</span>}
      {equipped && <span className="item-eq">E</span>}
    </button>
  )
}

/** 宝箱を開ける演出: 揺れる → 開く → レア度の光とともに中身 */
export function ChestReveal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const rare = item.rarity === 'UR' || item.rarity === 'SSR' || item.rarity === 'SR'
  const top = item.rarity === 'UR' || item.rarity === 'SSR'
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), item.rarity === 'UR' ? 2000 : item.rarity === 'SSR' ? 1400 : item.rarity === 'SR' ? 1000 : 700)
    return () => clearTimeout(t)
  }, [item.rarity])
  // レアは開いた瞬間に振動 (SSR は長め)
  useEffect(() => {
    if (open && rare) navigator.vibrate?.(item.rarity === 'UR' ? [40, 40, 40, 40, 40, 40, 200] : item.rarity === 'SSR' ? [30, 40, 30, 40, 120] : [20, 40, 20])
  }, [open, rare, item.rarity])
  return (
    <>
      <motion.div className="scrim" onClick={open ? onClose : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="reveal" data-testid="chest-reveal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        {!open ? (
          <div className={`chest-shake ${rare ? 'rare' : ''} ${top ? 'ssr' : ''} ${item.rarity === 'UR' ? 'ur' : ''}`} onClick={() => setOpen(true)}>
            🎁
          </div>
        ) : (
          <div className={`reveal-card glass r-${item.rarity} ${rare ? 'rare' : ''}`} data-testid="reveal-card">
            {rare && (
              <>
                <div className={`rare-flash f-${item.rarity}`} aria-hidden="true" />
                <div className="rare-stamp" aria-hidden="true">
                  {item.rarity === 'UR' ? 'UR!!!' : item.rarity === 'SSR' ? 'SSR!!' : 'SR!'}
                </div>
                <div className="confetti burst" aria-hidden="true">
                  {Array.from({ length: item.rarity === 'UR' ? 40 : item.rarity === 'SSR' ? 28 : 14 }, (_, i) => (
                    <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.05}s` }} />
                  ))}
                </div>
              </>
            )}
            <div className="rays" aria-hidden="true" />
            <div className="reveal-rarity">{item.rarity}</div>
            <div className="reveal-icon">
              <GearIcon slot={item.slot} rarity={item.rarity} size={64} />
            </div>
            <div className="reveal-name">{item.name}</div>
            <div className="reveal-slot">{slotLabel(item)}</div>
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
  /** 強化の素材に使える装備 (同じ部位で、同じレア度か 1 つ下のレア度の +10。装備していないもの) */
  materials: Item[]
  /** 持っているゴールド (ゴールドで強化できるか) */
  gold: number
  onEnhance: (by: 'item' | 'gold', material?: string) => void
}

/** アイテムの詳細と 装備 / 外す / 売る */
export function ItemSheet({ item, equipped, current, busy, onClose, onEquip, onSell, materials, gold, onEnhance }: SheetProps) {
  const maxed = (item.plus ?? 0) >= PLUS_MAX
  const lower = lowerRarity(item.rarity)
  const higher = higherRarity(item.rarity)
  const need = `同じ部位の${item.rarity}${lower ? `か、${lower}の+${PLUS_MAX}` : ''}`
  const cost = enhanceGold(item.rarity, item.plus ?? 0)
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
          <span className="is-icon">
            <GearIcon slot={item.slot} rarity={item.rarity} size={40} />
          </span>
          <div>
            <div className="is-name">
              <span className="item-rarity inline">{item.rarity}</span> {item.name}
              {item.plus ? <b className="item-plus">+{item.plus}</b> : null}
            </div>
            <div className="muted">{slotLabel(item)}</div>
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
        <div className="enhance-head">
          <b>⚒️ 強化</b>
          <span className="muted">
            {maxed
              ? higher
                ? `+${PLUS_MAX}が最大です。同じ部位の${higher}を強化する素材に使えます`
                : `+${PLUS_MAX}が最大です`
              : materials.length
                ? `素材にする装備を選んでください（${need}）。1段階ごとに全ステータス+10%。同じレア度の素材は強化段階を引き継ぎます`
                : `${need}の装備がもう1つあると強化できます`}
          </span>
        </div>
        {!maxed && materials.length > 0 && (
          <ul className="mat-list" data-testid="enhance-materials">
            {materials.map((m) => (
              <li key={m.id}>
                <button className={`mat r-${m.rarity}`} disabled={busy} onClick={() => onEnhance('item', m.id)} data-testid="enhance-material">
                  <GearIcon slot={m.slot} rarity={m.rarity} size={22} />
                  <span className="mat-name">
                    <span className="item-rarity inline">{m.rarity}</span> {m.name}
                    {m.plus ? <b className="item-plus">+{m.plus}</b> : null}
                  </span>
                  <span className="mat-to">
                    → <b>+{enhanceTo(item, m)}</b>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!maxed && (
          <div className="enhance-row">
            <button className="pill-btn ghost small" disabled={busy || gold < cost} onClick={() => onEnhance('gold')} data-testid="enhance-gold">
              💰{cost}で強化
            </button>
            <span className="muted">装備を使わずにゴールドで +{(item.plus ?? 0) + 1}（持っている 💰{gold}）</span>
          </div>
        )}
        <div className="sheet-actions">
          <button className="pill-btn primary grow" disabled={busy} onClick={() => onEquip(!equipped)} data-testid="equip-toggle">
            {equipped ? '外す' : `${slotLabel(item)}に装備`}
          </button>
          <button className="pill-btn ghost" disabled={busy || equipped} onClick={onSell} data-testid="sell">
            売る 💰{RARITY_SELL[item.rarity]}
          </button>
        </div>
      </motion.div>
    </>
  )
}
