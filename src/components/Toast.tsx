import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

export interface ToastData {
  id: number
  text: string
  undo?: () => void
  /** 取り消し以外の操作ボタンの文言 (例: 完了にする) */
  action?: string
}

export function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, toast.undo ? 5500 : 2600)
    return () => clearTimeout(t)
  }, [toast, onDone])

  return (
    <div className="toast-zone">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            className="toast glass"
            role="status"
            data-testid="toast"
            initial={{ y: 40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
          >
            <span className="toast-text">{toast.text}</span>
            {toast.undo && (
              <button
                className="toast-undo"
                data-testid="undo"
                onClick={() => {
                  toast.undo?.()
                  onDone()
                }}
              >
                {toast.action ?? '取り消す'}
              </button>
            )}
            <motion.span
              className="toast-bar"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: toast.undo ? 5.5 : 2.6, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
