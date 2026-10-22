import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

export interface ToastData {
  id: number
  text: string
  undo?: () => void
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
            initial={{ y: 40, opacity: 0, scale: 0.9, filter: 'blur(6px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: 20, opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
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
                取り消す
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
