import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { STATUSES, type Activity, type Person, type Status } from '../../shared/types'
import { enemyForStage, levelInfo } from '../../shared/game'
import { api } from '../api'
import { Avatar } from '../components/Dock'
import { PersonSheet } from '../components/PersonSheet'
import { StageBoard } from '../components/StageBoard'

const POLL_MS = 30_000
/** 最近の動きのタブ。タスクの 追加 / 着手 / 完了 */
const FEED_TABS: Record<Status, { label: string; verb: string; mark: string }> = {
  todo: { label: '未着手', verb: 'を追加', mark: '＋' },
  doing: { label: '進行中', verb: 'に着手', mark: '▶' },
  done: { label: '完了', verb: 'を完了', mark: '✓' },
}

interface Props {
  isAdmin?: boolean
  toast?: (text: string) => void
  onMeRenamed?: (name: string) => void
}

export function People({ isAdmin = false, toast, onMeRenamed }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [feedKind, setFeedKind] = useState<Status>('done')
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const kindRef = useRef(feedKind)
  kindRef.current = feedKind

  const loadFeed = useCallback(async (kind: Status) => {
    try {
      const a = await api.activity(kind)
      // 読み込み中にタブが切り替わっていたら捨てる
      if (kindRef.current === kind) setActivity(a.activity)
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      const [p] = await Promise.all([api.people(), loadFeed(kindRef.current)])
      setPeople(p.people)
    } catch {}
  }, [loadFeed])

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

  const switchFeed = (kind: Status) => {
    if (kind === feedKind) return
    setFeedKind(kind)
    kindRef.current = kind
    setActivity(null)
    setConfirmClear(false)
    loadFeed(kind)
  }

  const removeLog = async (id: number) => {
    setActivity((a) => a?.filter((x) => x.id !== id) ?? a)
    try {
      await api.deleteActivity(id)
    } catch {
      toast?.('削除できませんでした')
      loadFeed(feedKind)
    }
  }
  const clearLogs = async () => {
    setConfirmClear(false)
    const before = activity
    setActivity([])
    try {
      const r = await api.clearActivity(feedKind)
      toast?.(`「${FEED_TABS[feedKind].label}」のログを${r.deleted}件削除しました`)
    } catch {
      setActivity(before)
      toast?.('削除できませんでした')
    }
  }

  return (
    <div className="people" data-testid="people">
      <section className="panel glass feed" data-testid="feed">
        <div className="panel-head">
          <h2>最近の動き</h2>
          {isAdmin && !!activity?.length && (
            <button
              className={`reset-btn ${confirmClear ? 'confirm' : ''}`}
              onClick={() => (confirmClear ? clearLogs() : setConfirmClear(true))}
              onBlur={() => setConfirmClear(false)}
              data-testid="clear-logs"
            >
              {confirmClear ? 'このタブを全部消す？' : 'すべて消す'}
            </button>
          )}
        </div>
        <div className="feed-tabs" role="tablist">
          {STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={feedKind === s}
              className={`feed-tab t-${s} ${feedKind === s ? 'on' : ''}`}
              onClick={() => switchFeed(s)}
              data-testid={`feed-tab-${s}`}
            >
              {feedKind === s && <motion.span layoutId="feed-pill" className="feed-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="feed-tab-label">{FEED_TABS[s].label}</span>
            </button>
          ))}
        </div>
        {activity === null ? (
          <div className="skel-list">
            <div className="skel skel-card" style={{ height: 40 }} />
          </div>
        ) : activity.length === 0 ? (
          <p className="muted feed-empty">まだありません</p>
        ) : (
          <ul>
            {activity.slice(0, 15).map((a) => (
              <li key={a.id} data-testid="feed-item">
                <Avatar name={a.name} picture={a.picture} size={26} />
                <span className="feed-text">
                  <b>{a.name}</b>
                  <span className={`feed-mark t-${feedKind}`}> {FEED_TABS[feedKind].mark} </span>
                  {a.text}
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
        )}
      </section>

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
        </>
      )}

      <AnimatePresence>
        {openId && (
          <PersonSheet
            key={openId}
            id={openId}
            onClose={() => setOpenId(null)}
            canRename={isAdmin}
            onRenamed={(id, name) => {
              load()
              // 自分の名前を変えたらアプリ全体の表示も更新
              if (people?.find((p) => p.id === id)?.isMe) onMeRenamed?.(name)
            }}
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
