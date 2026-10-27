import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FLAGS, type Activity, type ActivityKind, type AttentionItem, type Notice, type Person, type RequestItem, san } from '../../shared/types'
import { enemyForStage, levelInfo } from '../../shared/game'
import { ACHIEVEMENT_MAP } from '../../shared/achievements'
import { api, STATUS_LABEL, type FeedKind, type XpChange } from '../api'
import { Avatar } from '../components/Dock'
import { DueBadge } from '../components/DueBadge'
import { PersonSheet } from '../components/PersonSheet'
import { RequestForm } from '../components/RequestForm'
import { StageBoard } from '../components/StageBoard'
import { MvpPanel } from '../components/GameExtras'

const POLL_MS = 30_000
const JST = 9 * 3600000
/** 最近の動きのタブ。すべて / タスクの 追加 / 着手 / 完了 */
const FEED_TABS: { key: FeedKind; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'todo', label: '未着手' },
  { key: 'doing', label: '進行中' },
  { key: 'done', label: '完了' },
]
const FEED_MARK: Partial<Record<ActivityKind, string>> = {
  todo: '＋',
  doing: '▶',
  done: '✓',
  flag: '⚑',
  request: '📨',
}
const REASON: Record<AttentionItem['reason'], { label: string; icon: string }> = {
  ...FLAGS,
  over: { label: '期限切れ', icon: '⏰' },
}

interface Props {
  isAdmin?: boolean
  toast?: (text: string) => void
  onMeRenamed?: (name: string) => void
  onNoticesRead?: () => void
  /** 自分のタスクをタップしたら自分の画面で開く */
  onOpenMine?: (taskId: string) => void
  onRequested?: () => void
  /** 他の人のタスクを進めたときの手伝い XP */
  onXp?: (xp: XpChange | null) => void
  /** PC 用の見え方 */
  pc?: boolean
}

export function People({ isAdmin = false, toast, onMeRenamed, onNoticesRead, onOpenMine, onRequested, onXp, pc = false }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [feedKind, setFeedKind] = useState<FeedKind>('all')
  const [feedUser, setFeedUser] = useState<string | null>(null)
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [more, setMore] = useState<number | null>(null) // 続きを読むためのカーソル
  const [loadingMore, setLoadingMore] = useState(false)
  const [attention, setAttention] = useState<AttentionItem[] | null>(null)
  const [requests, setRequests] = useState<{
    sent: RequestItem[]
    received: RequestItem[]
  } | null>(null)
  const [reqTab, setReqTab] = useState<'received' | 'sent'>('received')
  const [notices, setNotices] = useState<Notice[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [requestTo, setRequestTo] = useState<string | null | undefined>(undefined) // undefined = 閉じている
  const [confirmClear, setConfirmClear] = useState(false)
  const feedRef = useRef({ kind: feedKind, user: feedUser })
  feedRef.current = { kind: feedKind, user: feedUser }
  const meId = people?.find((p) => p.isMe)?.id
  const readRef = useRef(onNoticesRead)
  readRef.current = onNoticesRead

  const loadFeed = useCallback(async (kind: FeedKind, user: string | null) => {
    try {
      const a = await api.activity(kind, { user: user ?? undefined })
      // 読み込み中にタブ・人が切り替わっていたら捨てる
      if (feedRef.current.kind === kind && feedRef.current.user === user) {
        setActivity(a.activity)
        setMore(a.more ? a.cursor : null)
      }
    } catch {}
  }, [])

  const load = useCallback(async () => {
    try {
      const [p, at, rq] = await Promise.all([api.people(), api.attention(), api.requests(), loadFeed(feedRef.current.kind, feedRef.current.user)])
      setPeople(p.people)
      setAttention(at.items)
      setRequests(rq)
    } catch {}
  }, [loadFeed])

  // 通知は開いたときに既読にする (未読は強調表示のまま残す)
  useEffect(() => {
    api.notices().then(
      (r) => {
        setNotices(r.notices.slice(0, 8))
        if (r.unread)
          api.readNotices().then(
            () => readRef.current?.(),
            () => {},
          )
      },
      () => {},
    )
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

  const switchFeed = (kind: FeedKind, user: string | null) => {
    if (kind === feedKind && user === feedUser) return
    setFeedKind(kind)
    setFeedUser(user)
    feedRef.current = { kind, user }
    setActivity(null)
    setMore(null)
    setConfirmClear(false)
    loadFeed(kind, user)
  }

  const loadMore = async () => {
    if (more === null || loadingMore) return
    setLoadingMore(true)
    try {
      const a = await api.activity(feedKind, {
        before: more,
        user: feedUser ?? undefined,
      })
      setActivity((cur) => [...(cur ?? []), ...a.activity])
      setMore(a.more ? a.cursor : null)
    } catch {
      toast?.('読み込めませんでした')
    } finally {
      setLoadingMore(false)
    }
  }

  const removeLog = async (id: number) => {
    setActivity((a) => a?.filter((x) => x.id !== id) ?? a)
    try {
      await api.deleteActivity(id)
    } catch {
      toast?.('削除できませんでした')
      loadFeed(feedKind, feedUser)
    }
  }
  const clearLogs = async () => {
    setConfirmClear(false)
    const before = activity
    setActivity([])
    try {
      const r = await api.clearActivity(feedKind)
      toast?.(`「${FEED_TABS.find((t) => t.key === feedKind)!.label}」のログを${r.deleted}件削除しました`)
    } catch {
      setActivity(before)
      toast?.('削除できませんでした')
    }
  }

  /** タスクをタップ: 自分のなら自分の画面で開き、他の人のならその人の詳細を開く */
  const openTask = (ownerId: string, taskId: string) => (ownerId === meId ? onOpenMine?.(taskId) : setOpenId(ownerId))

  const reqList = requests?.[reqTab] ?? []
  const openReq = (requests?.received ?? []).filter((r) => r.task.status !== 'done').length

  const noticesPanel = (
    <>
      {notices.length > 0 && (
        <section className="panel glass notices" data-testid="notices">
          <div className="panel-head">
            <h2>あなたへのお知らせ</h2>
          </div>
          <ul>
            {notices.map((n) => (
              <li key={n.id} className={n.read ? '' : 'unread'} data-testid="notice">
                <Avatar name={n.actor.name} picture={n.actor.picture} skin={n.actor.skin} size={26} />
                <span className="feed-text">{n.text}</span>
                <time>{ago(n.createdAt)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
  const attentionPanel = (
    <>
      <section className="panel glass attention" data-testid="attention">
        <div className="panel-head">
          <h2>要対応</h2>
          <span className="muted">確認待ち・困っている・遅れそう・期限切れ</span>
        </div>
        {attention === null ? (
          <div className="skel-list">
            <div className="skel skel-card" style={{ height: 40 }} />
          </div>
        ) : attention.length === 0 ? (
          <p className="muted feed-empty">いまはありません 🎉</p>
        ) : (
          <ul>
            {attention.map((a) => (
              <li key={a.task.id}>
                <button className={`att-item r-${a.reason} ${a.mine ? 'mine' : ''}`} onClick={() => openTask(a.owner.id, a.task.id)} data-testid="attention-item">
                  <Avatar name={a.owner.name} picture={a.owner.picture} skin={a.owner.skin} size={28} />
                  <span className="att-body">
                    <span className="att-top">
                      <span className={`att-reason r-${a.reason}`}>
                        {REASON[a.reason].icon} {REASON[a.reason].label}
                      </span>
                      <b>{a.owner.name}</b>
                      {a.mine && <span className="me-tag">あなた宛て</span>}
                    </span>
                    <span className="att-title">{a.task.title}</span>
                    {(a.task.flag?.to || a.task.flag?.note) && (
                      <span className="att-note">
                        {a.task.flag?.to ? `→ ${a.task.flag.to.name}　` : ''}
                        {a.task.flag?.note}
                      </span>
                    )}
                    {a.reason === 'over' && <DueBadge task={a.task} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
  const requestsPanel = (
    <>
      <section className="panel glass requests" data-testid="requests">
        <div className="panel-head">
          <h2>依頼</h2>
          <button className="rename-btn" onClick={() => setRequestTo(null)} data-testid="request-open">
            ＋ 依頼する
          </button>
        </div>
        <div className="feed-tabs" role="tablist">
          {(['received', 'sent'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={reqTab === k} className={`feed-tab ${reqTab === k ? 'on' : ''}`} onClick={() => setReqTab(k)} data-testid={`req-tab-${k}`}>
              {reqTab === k && <motion.span layoutId="req-pill" className="feed-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="feed-tab-label">{k === 'received' ? `受けた${openReq ? ` ${openReq}` : ''}` : '出した'}</span>
            </button>
          ))}
        </div>
        {requests === null ? null : reqList.length === 0 ? (
          <p className="muted feed-empty">{reqTab === 'received' ? '受けた依頼はありません' : '他の人のページか「＋ 依頼する」から依頼できます'}</p>
        ) : (
          <ul>
            {reqList.map((r) => (
              <li key={r.task.id}>
                <button className={`req-item s-${r.task.status}`} onClick={() => openTask(r.owner.id, r.task.id)} data-testid="request-item">
                  <span className={`req-status t-${r.task.status}`}>{STATUS_LABEL[r.task.status]}</span>
                  <span className="att-body">
                    <span className="att-top">
                      <b>{reqTab === 'received' ? `${san(r.requester.name)}から` : `${san(r.owner.name)}へ`}</b>
                      <DueBadge task={r.task} />
                      {r.task.flag && (
                        <span className={`flag-chip f-${r.task.flag.kind}`}>
                          {FLAGS[r.task.flag.kind].icon} {FLAGS[r.task.flag.kind].label}
                        </span>
                      )}
                    </span>
                    <span className="att-title">{r.task.title}</span>
                    {r.task.note && <span className="att-note">{r.task.note}</span>}
                    {r.task.follow && (
                      <span className="att-note">
                        → 次: {r.task.follow.title}
                        {reqTab === 'received' ? `（${san(r.requester.name)}）` : ''}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
  const feedPanel = (
    <>
      <section className="panel glass feed" data-testid="feed">
        <div className="panel-head">
          <h2>最近の動き</h2>
          {isAdmin && !!activity?.length && !feedUser && (
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
          {FEED_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={feedKind === t.key}
              className={`feed-tab t-${t.key} ${feedKind === t.key ? 'on' : ''}`}
              onClick={() => switchFeed(t.key, feedUser)}
              data-testid={`feed-tab-${t.key}`}
            >
              {feedKind === t.key && <motion.span layoutId="feed-pill" className="feed-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="feed-tab-label">{t.label}</span>
            </button>
          ))}
        </div>
        {people && (
          <div className="who-row feed-who">
            <button className={`who ${feedUser === null ? 'on' : ''}`} onClick={() => switchFeed(feedKind, null)} data-testid="feed-user-all">
              全員
            </button>
            {people.map((p) => (
              <button key={p.id} className={`who ${feedUser === p.id ? 'on' : ''}`} onClick={() => switchFeed(feedKind, p.id)} data-testid="feed-user">
                {p.name}
              </button>
            ))}
          </div>
        )}
        {activity === null ? (
          <div className="skel-list">
            <div className="skel skel-card" style={{ height: 40 }} />
          </div>
        ) : activity.length === 0 ? (
          <p className="muted feed-empty">まだありません</p>
        ) : (
          <ul>
            {activity.map((a, i) => {
              const day = dayLabel(a.createdAt)
              const head = i === 0 || dayLabel(activity[i - 1].createdAt) !== day
              return <FeedRow key={a.id} a={a} head={head ? day : null} isAdmin={isAdmin} onDelete={() => removeLog(a.id)} onOpen={() => setOpenId(a.userId)} />
            })}
          </ul>
        )}
        {more !== null && (
          <button className="more-btn" onClick={loadMore} disabled={loadingMore} data-testid="feed-more">
            {loadingMore ? '読み込み中…' : 'もっと見る'}
          </button>
        )}
      </section>
    </>
  )
  const loading = !people && (
    <div className="skel-list">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skel skel-card tall" />
      ))}
    </div>
  )
  const personList = people && (
    <ul className="person-list">
      {people.map((p) => {
        const lv = levelInfo(p.xp).level
        const boss = enemyForStage(p.stage)
        const total = p.todo + p.doing + p.done || 1
        return (
          <li key={p.id}>
            <button className="person card-surface" onClick={() => setOpenId(p.id)} data-testid="person">
              <Avatar name={p.name} picture={p.picture} skin={p.skin} size={46} />
              <div className="person-body">
                <div className="person-top">
                  <span className="person-name">{p.name}</span>
                  {p.isMe && <span className="me-tag">自分</span>}
                  {p.title && ACHIEVEMENT_MAP[p.title] && <span className="title-chip">{ACHIEVEMENT_MAP[p.title].name}</span>}
                  {!!p.streak && <span className="streak-chip">🔥{p.streak}</span>}
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
  )
  const boards = people && (
    <>
      <MvpPanel />
      <StageBoard people={people} onOpen={setOpenId} />
    </>
  )

  return (
    <div className={`people ${pc ? 'pc' : ''}`} data-testid="people">
      {pc ? (
        // PC: 左にお知らせ・要対応、真ん中に最近の動き、右に依頼・MVP・冒険の進み具合。高さの違うパネルを列ごとに積む
        <>
          <div className="pc-cols">
            <div className="pc-col">
              {noticesPanel}
              {attentionPanel}
            </div>
            <div className="pc-col">{feedPanel}</div>
            <div className="pc-col">
              {requestsPanel}
              {boards}
            </div>
          </div>
          {loading}
          {personList}
        </>
      ) : (
        <>
          {noticesPanel}
          {attentionPanel}
          {requestsPanel}
          {feedPanel}
          {loading}
          {boards}
          {personList}
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
            onRequest={(id) => setRequestTo(id)}
            onXp={onXp}
            toast={toast}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {requestTo !== undefined && (
          <RequestForm
            to={requestTo ?? undefined}
            onClose={() => setRequestTo(undefined)}
            onDone={() => {
              setReqTab('sent')
              load()
              onRequested?.()
            }}
            toast={toast}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function FeedRow({ a, head, isAdmin, onDelete, onOpen }: { a: Activity; head: string | null; isAdmin: boolean; onDelete: () => void; onOpen: () => void }) {
  return (
    <>
      {head && (
        <li className="feed-day" data-testid="feed-day">
          {head}
        </li>
      )}
      <li data-testid="feed-item">
        <button className="feed-av" onClick={onOpen} aria-label={`${a.name}の詳細`}>
          <Avatar name={a.name} picture={a.picture} skin={a.skin} size={26} />
        </button>
        <span className="feed-text">
          <b>{a.name}</b>
          <span className={`feed-mark t-${a.kind}`}> {FEED_MARK[a.kind] ?? '・'} </span>
          {a.text}
        </span>
        <time>{clock(a.createdAt)}</time>
        {isAdmin && (
          <button className="feed-del" onClick={onDelete} aria-label="このログを削除" data-testid="feed-del">
            ×
          </button>
        )}
      </li>
    </>
  )
}

const jstDay = (t: number) => Math.floor((t + JST) / 86400000)

/** 日付の区切り: 今日 / 昨日 / 10/24（金） */
function dayLabel(t: number) {
  const diff = jstDay(Date.now()) - jstDay(t)
  if (diff === 0) return '今日'
  if (diff === 1) return '昨日'
  const d = new Date(t + JST)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${'日月火水木金土'[d.getUTCDay()]}）`
}

const clock = (t: number) => new Date(t + JST).toISOString().slice(11, 16)

function ago(t: number) {
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}
