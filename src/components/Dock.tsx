import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { User } from '../../shared/types'
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
}

export function Dock({ view, onChange, user, onLogout, badge }: Props) {
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

export function Avatar({ name, picture, size = 44 }: { name: string; picture?: string; size?: number }) {
  return picture ? (
    <img className="av-img" src={picture} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="av-text" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
