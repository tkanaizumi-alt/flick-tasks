import { AnimatePresence, motion } from 'motion/react'
import type { PendingMemo } from '../api'
import { CloudIcon, GoogleIcon, LogoMark } from './icons'

export function Login({ memos }: { memos: PendingMemo[] }) {
  return (
    <motion.main
      className="login"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {memos.length > 0 && (
        <ul className="guest-memos">
          <AnimatePresence initial={false}>
            {memos.map((m) => (
              <motion.li
                key={m.id}
                layout
                className="guest-memo glass"
                data-testid="guest-memo"
                initial={{ opacity: 0, y: -14, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <span className="guest-memo-text">{m.title}</span>
                <CloudIcon />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="login-center">
        <motion.div
          className="login-logo glass"
          initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
        >
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
            <LogoMark width={64} height={64} />
          </motion.div>
        </motion.div>

        <motion.a
          href="/auth/google"
          className="gbtn glass"
          data-testid="google-login"
          initial={{ y: 24, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.16 }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ y: -2 }}
        >
          <GoogleIcon width={22} height={22} />
          <span>Googleでログイン</span>
        </motion.a>

        {import.meta.env.DEV && (
          <a href="/auth/dev" className="dev-login" data-testid="dev-login">
            dev login
          </a>
        )}
      </div>
    </motion.main>
  )
}
