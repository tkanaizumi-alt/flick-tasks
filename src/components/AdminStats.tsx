import { useEffect, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { api, type AdminStats as Stats } from '../api'

const JST = 9 * 3600000
const when = (t: number) => {
  const d = new Date(t + JST)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** 管理者だけの集計: 1 人ずつの完了数・XP の増え方・機能の使われ方と、最近のエラー */
export function AdminStats({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const controls = useDragControls()
  useEffect(() => {
    api.adminStats().then(setS, () => setS(null))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass admin-stats"
        role="dialog"
        aria-label="集計"
        data-testid="admin-stats"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose()
        }}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>
        <h2 className="sheet-h">📊 集計（管理者だけ）</h2>
        {!s ? (
          <div className="skel-list">
            <div className="skel skel-card" />
          </div>
        ) : (
          <>
            <p className="muted">
              直近7日: 完了 {s.totals.done7}件 ・ 1件あたりの平均XP {s.totals.xpPerDone}（バランス調整の目安。中のタスクの基本は20）
            </p>
            <div className="stats-table-wrap">
              <table className="stats-table" data-testid="stats-table">
                <thead>
                  <tr>
                    <th>名前</th>
                    <th>Lv</th>
                    <th>St</th>
                    <th title="直近7日の完了">完了7日</th>
                    <th>完了30日</th>
                    <th title="タスクと手伝いで得たXP">XP7日</th>
                    <th>追加7日</th>
                    <th>未完了</th>
                    <th title="確認待ち・困っている・遅れそう">状況</th>
                    <th>手伝い7日</th>
                    <th>コメント7日</th>
                    <th title="AIで分解した子タスク">分解30日</th>
                    <th title="依頼されたタスク">依頼30日</th>
                    <th>繰り返し</th>
                  </tr>
                </thead>
                <tbody>
                  {s.people.map((p) => (
                    <tr key={p.id}>
                      <th>{p.name}</th>
                      <td>{p.level}</td>
                      <td>{p.stage}</td>
                      <td>{p.done7}</td>
                      <td>{p.done30}</td>
                      <td>{p.xp7}</td>
                      <td>{p.added7}</td>
                      <td>{p.open}</td>
                      <td>{p.flags}</td>
                      <td>{p.helps7}</td>
                      <td>{p.comments7}</td>
                      <td>{p.split30}</td>
                      <td>{p.requested30}</td>
                      <td>{p.recurring}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="stats-h">最近のエラー（30日分まで）</h3>
            {s.errors.length === 0 ? (
              <p className="muted">ありません 🎉</p>
            ) : (
              <ul className="error-list" data-testid="error-list">
                {s.errors.map((e) => (
                  <li key={e.id}>
                    <time>{when(e.at)}</time>
                    <span className={`err-src ${e.source}`}>{e.source === 'server' ? 'サーバー' : '画面'}</span>
                    <span className="err-msg">
                      {e.message}
                      <small>
                        {e.path}
                        {e.who ? ` ・ ${e.who}` : ''}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </motion.div>
    </>
  )
}
