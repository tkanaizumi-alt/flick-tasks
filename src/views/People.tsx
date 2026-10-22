import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import type { Activity, Person } from '../../shared/types'
import { enemyForStage, levelInfo } from '../../shared/game'
import { api } from '../api'
import { Avatar } from '../components/Dock'
import { PersonSheet } from '../components/PersonSheet'
import { StageBoard } from '../components/StageBoard'

const POLL_MS = 30_000

export function People({ isAdmin = false, toast }: { isAdmin?: boolean; toast?: (text: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const removeLog = async (id: number) => {
    setActivity((a) => a.filter((x) => x.id !== id))
    try {
      await api.deleteActivity(id)
    } catch {
      toast?.('削除できませんでした')
      load()
    }
  }
  const clearLogs = async () => {
    setConfirmClear(false)
    const before = activity
    setActivity([])
    try {
      const r = await api.clearActivity()
      toast?.(`${r.deleted}件のログを削除しました`)
    } catch {
      setActivity(before)
      toast?.('削除できませんでした')
    }
  }

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api.people(), api.activity()])
      setPeople(p.people)
      setActivity(a.activity)
    } catch {}
  }, [])

  // 表示中は 30 秒ごと + 画面に戻ったときに更新
  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  return (
    <div className="people" data-testid="people">
      {!people ? (
        <div className="skel-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel skel-card tall" />
          ))}
        </div>
      ) : (
        <>
          <StageBoard people={people} onOpen={setOpenId} />
          <ul className="person-list">
            {people.map((p) => {
              const lv = levelInfo(p.xp).level
              const boss = enemyForStage(p.stage)
              const total = p.todo + p.doing + p.done || 1
              return (
                <li key={p.id}>
                  <button className="person card-surface" onClick={() => setOpenId(p.id)} data-testid="person">
                    <Avatar name={p.name} picture={p.picture} size={46} />
                    <div className="person-body">
                      <div className="person-top">
                        <span className="person-name">{p.name}</span>
                        {p.isMe && <span className="me-tag">自分</span>}
                        <span className="person-job">
                          {p.jobIcon} {p.jobName}
                        </span>
                        <span className="person-lv">Lv {lv}</span>
                      </div>
                      <div className="person-meta">
                        <span>今日 ✓{p.today}</span>
                        <span>7日 ✓{p.week}</span>
                        <span className="person-stage">
                          St.{p.stage} {boss.icon} {boss.name}
                        </span>
                      </div>
                      <div className="mini-bar" aria-label={`未着手${p.todo} 進行中${p.doing} 完了${p.done}`}>
                        <span className="todo" style={{ flex: p.todo / total }} />
                        <span className="doing" style={{ flex: p.doing / total }} />
                        <span className="done" style={{ flex: p.done / total }} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>

          {activity.length > 0 && (
            <section className="panel glass feed" data-testid="feed">
              <div className="panel-head">
                <h2>最近の動き</h2>
                {isAdmin && (
                  <button
                    className={`reset-btn ${confirmClear ? 'confirm' : ''}`}
                    onClick={() => (confirmClear ? clearLogs() : setConfirmClear(true))}
                    onBlur={() => setConfirmClear(false)}
                    data-testid="clear-logs"
                  >
                    {confirmClear ? '本当に全部消す？' : 'すべて消す'}
                  </button>
                )}
              </div>
              <ul>
                {activity.slice(0, 15).map((a) => (
                  <li key={a.id} data-testid="feed-item">
                    <Avatar name={a.name} picture={a.picture} size={26} />
                    <span className="feed-text">
                      <b>{a.name}</b>
                      {a.kind === 'done'
                        ? ` ✓ ${a.text}`
                        : a.kind === 'levelup'
                          ? ` が ${a.text} に到達`
                          : a.kind === 'item'
                            ? ` が ${a.text} を入手`
                            : a.kind === 'job'
                              ? ` が上位職 ${a.text} を解放`
                              : a.kind === 'skill'
                                ? ` が隠しスキル ✦${a.text} を習得`
                                : ` が ${a.text} を撃破`}
                    </span>
                    <time>{ago(a.createdAt)}</time>
                    {isAdmin && (
                      <button className="feed-del" onClick={() => removeLog(a.id)} aria-label="このログを削除" data-testid="feed-del">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <AnimatePresence>
        {openId && (
          <PersonSheet
            key={openId}
            id={openId}
            onClose={() => setOpenId(null)}
            canRename={isAdmin && !people?.find((p) => p.id === openId)?.isMe}
            onRenamed={() => load()}
            toast={toast}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ago(t: number) {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}
