import { useEffect, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { api, type AdminStats as Stats } from '../api'

const JST = 9 * 3600000
const when = (t: number) => {
  const d = new Date(t + JST)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** 管理者だけの集計: 1 人ずつの完了数・XP の増え方・機能の使われ方と、最近のエラー */
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)

export function AdminStats({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Stats | null>(null)
  const [backups, setBackups] = useState<{ day: string; bytes: number; rows: number }[] | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [allFeatures, setAllFeatures] = useState(false)
  const controls = useDragControls()
  const loadBackups = () => api.backups().then((r) => setBackups(r.backups), () => setBackups([]))
  useEffect(() => {
    api.adminStats().then(setS, () => setS(null))
    loadBackups()
  }, [])
  const backupNow = async () => {
    setBackingUp(true)
    try {
      await api.backupNow()
      await loadBackups()
    } finally {
      setBackingUp(false)
    }
  }
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
                    <th title="今持っているゴールド">所持💰</th>
                    <th title="直近7日に入ったゴールド">入💰7日</th>
                    <th title="直近7日に使ったゴールド">出💰7日</th>
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
                      <td>{p.gold}</td>
                      <td>{p.goldIn7}</td>
                      <td>{p.goldOut7}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="stats-h">ゴールドの流れ（直近7日）</h3>
            {s.goldFlow.length === 0 ? (
              <p className="muted">まだ記録がありません</p>
            ) : (
              <>
                <p className="muted">
                  入った {s.goldFlow.filter((g) => g.gold > 0).reduce((a, g) => a + g.gold, 0)} ・ 使った {-s.goldFlow.filter((g) => g.gold < 0).reduce((a, g) => a + g.gold, 0)}
                  （使う方が少なすぎると貯まる一方、多すぎると足りなくなります）
                </p>
                <ul className="flow-list" data-testid="gold-flow">
                  {s.goldFlow.map((g) => (
                    <li key={g.id}>
                      <span>{g.label}</span>
                      <small className="muted">{g.n}回</small>
                      <b className={g.gold > 0 ? 'in' : 'out'}>
                        {g.gold > 0 ? '+' : ''}
                        {g.gold}
                      </b>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3 className="stats-h">機能の使われ方（直近30日）</h3>
            <p className="muted">
              {s.usageSince ? `${when(s.usageSince)} から記録しています。` : 'まだ記録がありません。'}
              1〜2週間たってから、0回や1人しか使っていない機能を「目立たなくする・やめる」候補にします。
            </p>
            <ul className="usage-list" data-testid="usage-list">
              {(allFeatures ? s.features : s.features.slice(0, 12)).map((f) => (
                <li key={f.id} className={f.n ? '' : 'unused'}>
                  <span className="usage-name">{f.label}</span>
                  <span className="usage-bar">
                    <span style={{ transform: `scaleX(${f.n / Math.max(1, s.features[0]?.n ?? 1)})` }} />
                  </span>
                  <b>{f.n}回</b>
                  <small className="muted">{f.people}人</small>
                </li>
              ))}
            </ul>
            {s.features.length > 12 && (
              <button className="more-btn" onClick={() => setAllFeatures((v) => !v)} data-testid="usage-all">
                {allFeatures ? '少なく表示' : `すべて表示（使われていないもの ${s.features.filter((f) => !f.n).length}個を含む）`}
              </button>
            )}

            <h3 className="stats-h">バックアップ（毎日3時に自動・14日分）</h3>
            {backups === null ? (
              <p className="muted">読み込み中…</p>
            ) : (
              <>
                {backups.length === 0 ? (
                  <p className="muted">まだありません</p>
                ) : (
                  <ul className="backup-list" data-testid="backup-list">
                    {backups.map((b) => (
                      <li key={b.day}>
                        <span>{b.day}</span>
                        <small className="muted">
                          {b.rows}行 ・ {kb(b.bytes)}
                        </small>
                        <a className="pill-btn ghost small" href={`/api/admin/backups/${b.day}`} download={`flick-backup-${b.day}.json`}>
                          保存
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <button className="pill-btn ghost small" disabled={backingUp} onClick={backupNow} data-testid="backup-now">
                  {backingUp ? '作成中…' : '今すぐバックアップ'}
                </button>
              </>
            )}

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
