import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { User } from '../../shared/types'
import { SKIN_MAP } from '../../shared/game'
import { EVENT_SKIN_MAP } from '../../shared/extras'
import { CheckCircleIcon, PeopleIcon, SwordIcon } from './icons'

export type View = 'me' | 'people' | 'game'

const ITEMS: { key: View; label: string; Icon: typeof CheckCircleIcon }[] = [
  { key: 'me', label: '自分', Icon: CheckCircleIcon },
  { key: 'people', label: 'みんな', Icon: PeopleIcon },
  { key: 'game', label: '冒険', Icon: SwordIcon },
]

interface Props {
  view: View
  onChange: (v: View) => void
  user: User | null
  onLogout: () => void
  badge: number // 未使用 SP
  /** みんなタブの未読 (自分宛ての通知) */
  peopleBadge?: number
  onHistory: () => void
}

export function Dock({ view, onChange, user, onLogout, badge, peopleBadge = 0, onHistory }: Props) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="dock">
      <nav className="tabbar glass" role="tablist">
        {ITEMS.map(({ key, label, Icon }) => {
          const on = view === key
          return (
            <button key={key} role="tab" aria-selected={on} data-testid={`nav-${key}`} className={`tab ${on ? 'on' : ''}`} onClick={() => onChange(key)}>
              {on && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="tab-icon">
                <Icon />
              </span>
              <span className="tab-label">{label}</span>
              {key === 'people' && peopleBadge > 0 && (
                <span className="tab-count notice" data-testid="people-badge">
                  {peopleBadge > 9 ? '9+' : peopleBadge}
                </span>
              )}
              {key === 'game' && badge > 0 && (
                <span className="tab-count sp" data-testid="sp-badge">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="avatar-wrap">
        <button className="avatar glass" onClick={() => setMenu((m) => !m)} aria-label="アカウント" data-testid="avatar">
          <Avatar name={user?.name || user?.email || '?'} picture={user?.picture} />
        </button>
        <AnimatePresence>
          {menu && (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <motion.div
                className="menu glass"
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 6 }}
                transition={{ duration: 0.16 }}
                style={{ transformOrigin: 'bottom right' }}
              >
                <div className="menu-email">{user?.email}</div>
                <button
                  className="menu-item"
                  data-testid="menu-history"
                  onClick={() => {
                    setMenu(false)
                    onHistory()
                  }}
                >
                  📒 履歴・エクスポート
                </button>
                <button
                  className="menu-item danger"
                  data-testid="logout"
                  onClick={() => {
                    setMenu(false)
                    onLogout()
                  }}
                >
                  ログアウト
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** アイコン。スキンを選んでいればスキン、なければ Google の写真 (なければ頭文字) */
export function Avatar({ name, picture, size = 44, skin }: { name: string; picture?: string; size?: number; skin?: string | null }) {
  const sk = skin ? (SKIN_MAP[skin] ?? EVENT_SKIN_MAP[skin]) : undefined
  if (sk)
    return (
      <span className="av-skin" style={{ width: size, height: size, fontSize: size * 0.58, background: sk.bg }} role="img" aria-label={sk.name}>
        {sk.emoji}
      </span>
    )
  return picture ? (
    <img className="av-img" src={picture} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="av-text" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
