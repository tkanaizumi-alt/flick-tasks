import { motion } from 'motion/react'

const widths = [62, 44, 71, 38, 56, 48]

/** index.html の初期スケルトンと同じ見た目。React 起動後もデータ取得完了まで表示する */
export function Skeleton() {
  return (
    <motion.div
      className="boot-skel"
      aria-busy="true"
      aria-label="読み込み中"
      exit={{ opacity: 0, filter: 'blur(8px)', scale: 1.02 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="skel-list">
        {widths.map((w, i) => (
          <div key={i} className="skel skel-card">
            <div className="skel-dot" />
            <div className="skel-line" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="skel skel-tabbar" />
    </motion.div>
  )
}
