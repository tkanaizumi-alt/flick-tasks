import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { STATUSES, type Status, type User } from '../../shared/types'
import { STATUS_LABEL } from '../api'
import { CheckCircleIcon, CircleIcon, PlayIcon } from './icons'

const ICON: Record<Status, typeof CircleIcon> = { todo: CircleIcon, doing: PlayIcon, done: CheckCircleIcon }

interface Props {
  tab: Status
  counts: Record<Status, number>
  onChange: (s: Status) => void
  user: User | null
  onLogout: () => void
}

export function TabBar({ tab, counts, onChange, user, onLogout }: Props) {
  const [menu, setMenu] = useState(false)
  return (
    <motion.div
      className="dock"
      initial={{ y: 90, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.08 }}
    >
      <nav className="tabbar glass" role="tablist">
        {STATUSES.map((s) => {
          const Icon = ICON[s]
          const on = tab === s
          return (
            <button
              key={s}
              role="tab"
              aria-selected={on}
              data-testid={`tab-${s}`}
              className={`tab ${on ? 'on' : ''} t-${s}`}
              onClick={() => onChange(s)}
            >
              {on && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}
              <motion.span className="tab-icon" animate={{ scale: on ? 1.08 : 1, y: on ? -1 : 0 }}>
                <Icon />
              </motion.span>
              <span className="tab-label">{STATUS_LABEL[s]}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={counts[s]}
                  className="tab-count"
                  data-testid={`count-${s}`}
                  initial={{ scale: 1.8, opacity: 0, y: -6 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.4, opacity: 0, y: 6 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                >
                  {counts[s]}
                </motion.span>
              </AnimatePresence>
            </button>
          )
        })}
      </nav>

      <div className="avatar-wrap">
        <motion.button
          className="avatar glass"
          whileTap={{ scale: 0.88 }}
          onClick={() => setMenu((m) => !m)}
          aria-label="アカウント"
          data-testid="avatar"
        >
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}</span>}
        </motion.button>
        <AnimatePresence>
          {menu && (
            <>
              <motion.div className="menu-scrim" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div
                className="menu glass"
                initial={{ opacity: 0, scale: 0.6, y: 20, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.7, y: 14, filter: 'blur(6px)' }}
                transition={{ type: 'spring', stiffness: 480, damping: 32 }}
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
    </motion.div>
  )
}
