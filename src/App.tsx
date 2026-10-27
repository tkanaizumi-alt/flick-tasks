import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { STATUSES, tagsOf, type Flag, type Status, type Task, type User } from '../shared/types'
import { spInfo, type PlayerState, type Weight } from '../shared/game'
import type { AchievementDef } from '../shared/achievements'
import { api, HttpError, pending, STATUS_LABEL, type PendingMemo, type XpChange } from './api'
import { Background } from './components/Background'
import { Skeleton } from './components/Skeleton'
import { exitDir } from './components/TaskCard'
import { Dock, type Theme, type View } from './components/Dock'
import { MeToolbar } from './components/StatusTabs'
import { SelectBar } from './components/SelectBar'
import { Sheet } from './components/Sheet'
import { Toast, type ToastData } from './components/Toast'
import { Login } from './components/Login'
import { LevelUp, XpPops, type Celebration, type XpPopData } from './components/Rewards'
import { TaskBoard } from './components/TaskBoard'
import { store } from './store'
import { DONE_CMP, DONE_SORTS, DONE_SORT_KEY, SORTS, SORT_CMP, SORT_KEY, type DoneSort, type SortMode } from './sorting'
import { LayoutGuide, LayoutToggle } from './components/LayoutToggle'
import { useLayouts } from './layout'
// 開いた瞬間のメモを速くするため、みんな・冒険・履歴は使うときに読み込む
const People = lazy(() => import('./views/People').then((m) => ({ default: m.People })))
const Adventure = lazy(() => import('./views/Adventure').then((m) => ({ default: m.Adventure })))
const History = lazy(() => import('./components/History').then((m) => ({ default: m.History })))
const Help = lazy(() => import('./components/Help').then((m) => ({ default: m.Help })))
const AdminStats = lazy(() => import('./components/AdminStats').then((m) => ({ default: m.AdminStats })))
const ViewSkeleton = () => (
  <div className="skel-list">
    <div className="skel skel-card tall" />
    <div className="skel skel-card tall" />
  </div>
)

export type UITask = Task & { syncing?: boolean; ai?: boolean }
type Phase = 'loading' | 'guest' | 'ready'

const CACHE_KEY = 'flick.cache'
const TAB_KEY = 'flick.tab'
const VIEW_KEY = 'flick.view'
const HINT_KEY = 'flick.hint.select'
const NOTICE_POLL_MS = 60_000
const THEME_KEY = 'flick.theme'
const ORDER: Status[] = ['todo', 'doing', 'done']

const inflight = new Set<string>()
const composer = () => document.getElementById('composer')

const newTask = (p: Partial<UITask> & { id: string; title: string }): UITask => ({
  note: '',
  status: 'todo',
  position: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...p,
})

export function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [player, setPlayer] = useState<PlayerState | null>(null)
  const [tasks, setTasks] = useState<UITask[]>([])
  const [tab, setTabState] = useState<Status>(() => {
    const t = store.get<Status>(TAB_KEY, 'todo')
    return STATUSES.includes(t) ? t : 'todo'
  })
  // 開いた瞬間メモできるよう、起動時は常に「自分」
  const [view, setViewState] = useState<View>('me')
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToastState] = useState<ToastData | null>(null)
  const [guestMemos, setGuestMemos] = useState<PendingMemo[]>([])
  const [aiBusy, setAiBusy] = useState(0)
  const [pops, setPops] = useState<XpPopData[]>([])
  const [levelUp, setLevelUp] = useState<Celebration | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null) // null = 選択モードでない
  const [query, setQuery] = useState<string | null>(null) // null = 検索を閉じている
  const [unread, setUnread] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(() => store.get<Theme>(THEME_KEY, 'auto'))
  const setTheme = (t: Theme) => {
    setThemeState(t)
    store.set(THEME_KEY, t)
  }
  const [hint, setHint] = useState(() => !store.get<boolean>(HINT_KEY, false))
  const [sort, setSortState] = useState<SortMode>(() => {
    const v = store.get<SortMode>(SORT_KEY, 'new')
    return v in SORT_CMP ? v : 'new'
  })
  const setSort = (v: SortMode) => {
    setSortState(v)
    store.set(SORT_KEY, v)
  }
  const [doneSort, setDoneSortState] = useState<DoneSort>(() => {
    const v = store.get<DoneSort>(DONE_SORT_KEY, 'recent')
    return v in DONE_CMP ? v : 'recent'
  })
  const setDoneSort = (v: DoneSort) => {
    setDoneSortState(v)
    store.set(DONE_SORT_KEY, v)
  }
  const doneSortRow = (
    <div className="sort-row done-sort" role="radiogroup" aria-label="完了の並び順" data-testid="done-sort">
      {DONE_SORTS.map((s) => (
        <button key={s.key} role="radio" aria-checked={doneSort === s.key} className={`sort-btn ${doneSort === s.key ? 'on' : ''}`} onClick={() => setDoneSort(s.key)} data-testid={`done-sort-${s.key}`}>
          {s.label}
        </button>
      ))}
    </div>
  )
  const unreadRef = useRef(0)
  // 画面ごとの見え方 (スマホ / PC)。PC 表示の「自分」は未着手・進行中・完了の 3 列
  const { isPc, setLayout, canToggle } = useLayouts()
  const wide = isPc('me')
  const [layoutGuide, setLayoutGuide] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  // 並べ替えモード (null = していない)。ステータスごとの新しい並び (上から順の ID)
  const [reorder, setReorder] = useState<Partial<Record<Status, string[]>> | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const tabRef = useRef(tab)
  tabRef.current = tab
  const viewRef = useRef(view)
  viewRef.current = view

  const setTab = useCallback((t: Status) => {
    setSelected(null)
    setTabState(t)
    store.set(TAB_KEY, t)
  }, [])

  const setView = useCallback((v: View) => {
    setSelected(null)
    setViewState(v)
    store.set(VIEW_KEY, v)
    window.scrollTo({ top: 0 })
  }, [])

  // メモ欄は「自分」の画面でだけ出す (index.html 側の要素なので body の属性で切り替え)
  useEffect(() => {
    document.body.dataset.view = phase === 'ready' ? view : 'me'
    // サイドバーなど画面全体の見え方は、今の画面の設定に合わせる
    document.body.dataset.layout = phase === 'ready' && isPc(view) ? 'pc' : 'mobile'
  }, [view, phase, isPc])

  // 見た目: 自動なら端末の設定 (ダークモード) に合わせる
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && m.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1118' : '#f6f7fb')
    }
    apply()
    m.addEventListener('change', apply)
    return () => m.removeEventListener('change', apply)
  }, [theme])

  // PC のキーボード操作: N 新しいタスク / 「/」検索 / 1・2・3 画面 / ? 使い方 (入力中は効かない)
  useEffect(() => {
    if (phase !== 'ready') return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        setView('me')
        setTimeout(() => (document.getElementById('memo') as HTMLTextAreaElement | null)?.focus(), 50)
      } else if (k === '/') {
        e.preventDefault()
        setView('me')
        setQuery('')
      } else if (k === '1' || k === '2' || k === '3') {
        setView((['me', 'people', 'game'] as const)[Number(k) - 1])
      } else if (k === '?') {
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, setView])

  // 見え方を切り替えられることを、メンバーごとに最初の 1 回だけ案内する
  useEffect(() => {
    if (phase !== 'ready' || !user || !canToggle) return
    if (store.get<boolean>(`flick.hint.layout.${user.id}`, false)) return
    const t = setTimeout(() => setLayoutGuide(true), 1500)
    return () => clearTimeout(t)
  }, [phase, user, canToggle])

  const showToast = useCallback((text: string, undo?: () => void, action?: string) => setToastState({ id: Date.now(), text, undo, action }), [])
  const clearToast = useCallback(() => setToastState(null), [])

  const upsert = useCallback((list: UITask[]) => {
    setTasks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]))
      for (const t of list) map.set(t.id, { ...map.get(t.id), ...t })
      return [...map.values()]
    })
  }, [])
  const removeLocal = useCallback((ids: string[]) => setTasks((prev) => prev.filter((t) => !ids.includes(t.id))), [])

  /** 新しく取れた実績のお祝い (レベルアップのお祝いと重ならないよう少し遅らせる) */
  const celebrateAchievements = useCallback((list: AchievementDef[] | undefined, delay: number) => {
    if (!list?.length) return
    const a = list[list.length - 1]
    setTimeout(
      () =>
        setLevelUp({
          label: 'ACHIEVEMENT',
          title: `${a.icon} ${a.name}`,
          sub: list.length > 1 ? `ほか${list.length - 1}個の実績を獲得。冒険の「実績」で称号にできます` : `${a.desc}。冒険の「実績」で称号にできます`,
        }),
      delay,
    )
  }, [])

  const onXp = useCallback((xp: XpChange | null) => {
    if (!xp || xp.amount === 0) return
    const id = Date.now() + Math.random()
    setPops((p) => [...p.slice(-2), { id, amount: xp.amount, gold: xp.gold, bonuses: xp.bonuses }])
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1800)
    setPlayer((p) => (p ? { ...p, xp: Math.max(0, p.xp + xp.amount), gold: Math.max(0, p.gold + xp.gold) } : p))
    // 職業 XP なども変わるのでサーバーの状態で取り直す
    api.player().then((r) => {
      setPlayer(r.player)
      celebrateAchievements(r.unlocked, 2600)
    }, () => {})
    if (xp.unlocked) {
      navigator.vibrate?.([20, 60, 20, 60, 20])
      const u = xp.unlocked
      setTimeout(() => setLevelUp({ label: 'NEW JOB', title: `${u.icon} ${u.name}`, sub: '上位職が解放されました' }), 500)
    } else if (xp.leveledUp) {
      navigator.vibrate?.([12, 40, 12])
      setTimeout(() => setLevelUp({ label: 'LEVEL UP', title: `Lv ${xp.level}`, sub: 'SP +3' }), 500)
    }
  }, [])

  // --- 起動: セッション確認とタスク取得 ---
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ user }, { tasks }, { player, unlocked }] = await Promise.all([api.me(), api.list(), api.player()])
        celebrateAchievements(unlocked, 1200)
        if (cancelled) return
        setUser(user)
        setTasks(tasks)
        setPlayer(player)
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        if (e instanceof HttpError && e.status === 401) {
          setGuestMemos(pending.read())
          setPhase('guest')
        } else {
          // オフライン等: 前回のキャッシュで表示
          setTasks(store.get<UITask[]>(CACHE_KEY, []))
          setUser(store.get<User | null>('flick.user', null))
          setPhase('ready')
          showToast('オフライン')
        }
      }
    })()
    const params = new URLSearchParams(location.search)
    const login = params.get('login')
    if (login === 'failed' || login === 'denied') {
      showToast(login === 'denied' ? 'このアカウントは利用できません' : 'ログインに失敗しました')
      history.replaceState(null, '', '/')
    }
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (phase !== 'ready') return
    store.set(CACHE_KEY, tasks.filter((t) => !t.ai))
    if (user) store.set('flick.user', user)
  }, [tasks, user, phase])

  // --- 未送信メモの処理 (index.html の入力欄がキューに積む) ---
  const drain = useCallback(async () => {
    if (phaseRef.current === 'guest') {
      setGuestMemos(pending.read())
      return
    }
    if (phaseRef.current !== 'ready') return
    for (const p of pending.read()) {
      if (inflight.has(p.id)) continue
      inflight.add(p.id)
      if (viewRef.current !== 'me') setView('me')
      if (tabRef.current !== 'todo') setTab('todo')
      if (p.ai) {
        upsert([newTask({ id: p.id, title: p.title, position: p.at, ai: true, syncing: true })])
        setAiBusy((n) => n + 1)
        try {
          const { tasks: titles } = await api.ai('split', p.title)
          const base = Date.now()
          const items = titles.map((title, i) => ({ id: `${p.id}-${i}`, title, status: 'todo' as Status, position: base - i }))
          const { tasks: created } = await api.create(items, 'ai')
          removeLocal([p.id])
          // 少しずつ時間差で追加
          created.forEach((t, i) => setTimeout(() => upsert([t]), i * 70))
          pending.remove(p.id)
          if (created.length > 1) showToast(`${created.length}件に整理`)
        } catch (e) {
          try {
            const { tasks: created } = await api.create([{ id: p.id, title: p.title, status: 'todo', position: p.at }])
            upsert(created.map((t) => ({ ...t, ai: false, syncing: false })))
            pending.remove(p.id)
            showToast('AIを利用できませんでした')
          } catch {
            upsert([newTask({ id: p.id, title: p.title, position: p.at, ai: false, syncing: true })])
          }
        } finally {
          setAiBusy((n) => n - 1)
          inflight.delete(p.id)
        }
      } else {
        upsert([newTask({ id: p.id, title: p.title, position: p.at, syncing: true })])
        try {
          const { tasks: created } = await api.create([{ id: p.id, title: p.title, status: 'todo', position: p.at }])
          upsert(created.map((t) => ({ ...t, syncing: false })))
          pending.remove(p.id)
        } catch (e) {
          if (e instanceof HttpError && e.status === 401) setPhase('guest')
        } finally {
          inflight.delete(p.id)
        }
      }
    }
  }, [removeLocal, setTab, setView, showToast, upsert])

  useEffect(() => {
    drain()
    const onPending = () => drain()
    window.addEventListener('flick:pending', onPending)
    window.addEventListener('online', onPending)
    return () => {
      window.removeEventListener('flick:pending', onPending)
      window.removeEventListener('online', onPending)
    }
  }, [drain, phase])

  useEffect(() => {
    composer()?.classList.toggle('ai-busy', aiBusy > 0)
  }, [aiBusy])

  // --- 操作 ---
  const patchTask = useCallback(
    async (task: UITask, patch: Partial<Pick<Task, 'title' | 'note' | 'status' | 'position' | 'priority'>>) => {
      upsert([{ ...task, ...patch, updatedAt: Date.now() }])
      try {
        const { task: saved, xp } = await api.update(task.id, patch)
        upsert([saved])
        onXp(xp)
        // 子タスクを動かしたら元タスクの進み具合 (3/5 など) を取り直し、全部終わったら元タスクの完了を提案
        if (saved.parent && patch.status) {
          const pid = saved.parent.id
          const { tasks: all } = await api.list()
          upsert(all.filter((t) => t.id === pid || t.parent?.id === pid))
          const parent = all.find((t) => t.id === pid)
          if (patch.status === 'done' && parent && parent.status !== 'done' && parent.children && parent.children.done === parent.children.total) {
            setTimeout(
              () => showToast(`子タスクがすべて完了。「${parent.title}」も完了にしますか？`, () => patchRef.current(parent, { status: 'done', position: Date.now() }), '完了にする'),
              900,
            )
          }
        }
      } catch {
        upsert([task])
        showToast('保存できませんでした')
      }
    },
    [onXp, showToast, upsert],
  )
  const patchRef = useRef(patchTask)
  patchRef.current = patchTask

  const deleteTask = useCallback(
    async (task: UITask) => {
      removeLocal([task.id])
      showToast('削除しました', async () => {
        exitDir.delete(task.id)
        upsert([task])
        try {
          await api.create([task], task.source ?? 'user')
        } catch {
          showToast('復元できませんでした')
        }
      })
      try {
        await api.remove(task.id)
      } catch {
        upsert([task])
        showToast('削除できませんでした')
      }
    },
    [removeLocal, showToast, upsert],
  )

  const onSwipe = useCallback(
    (task: UITask, dir: 1 | -1) => {
      const next = ORDER.indexOf(task.status) + dir
      if (next < 0 || next >= ORDER.length) {
        deleteTask(task)
        return
      }
      const status = ORDER[next]
      const prev = { status: task.status, position: task.position }
      patchTask(task, { status, position: Date.now() })
      showToast(`${STATUS_LABEL[status]}へ`, () => {
        exitDir.delete(task.id)
        patchTask({ ...task, status }, prev)
      })
    },
    [deleteTask, patchTask, showToast],
  )

  /** 確認画面で編集した分解案を、元タスクにつながった子タスクとして追加 */
  const onAddChildren = useCallback(
    async (task: UITask, titles: string[], title: string, note: string) => {
      // シートは追加後に閉じるので、編集中のタイトル・詳細を先に保存しておく
      const patch: Partial<Pick<Task, 'title' | 'note'>> = {}
      if (title && title !== task.title) patch.title = title
      if (note !== task.note) patch.note = note
      if (Object.keys(patch).length) await patchTask(task, patch)
      try {
        const base = Date.now()
        const { tasks: created } = await api.create(
          titles.map((t, i) => ({ id: crypto.randomUUID(), title: t, status: 'todo' as Status, position: base - i, parentId: task.id })),
          'ai',
        )
        setOpenId(null)
        if (tabRef.current !== 'todo') setTab('todo')
        created.forEach((t, i) => setTimeout(() => upsert([t]), 200 + i * 70))
        api.list().then((r) => upsert(r.tasks.filter((t) => t.id === task.id)), () => {})
        showToast(`${created.length}件に分解`)
      } catch (e) {
        showToast(e instanceof HttpError && e.reason ? e.reason : '追加できませんでした')
      }
    },
    [patchTask, setTab, showToast, upsert],
  )

  const onWeight = useCallback(
    async (task: UITask, weight: Weight) => {
      upsert([{ ...task, weight }])
      try {
        const { task: saved } = await api.setWeight(task.id, weight)
        upsert([saved])
      } catch (e) {
        upsert([task])
        showToast(e instanceof HttpError && e.reason ? e.reason : '変更できませんでした')
      }
    },
    [showToast, upsert],
  )

  const onFlag = useCallback(
    async (task: UITask, flag: Flag | null, note = '', to: string | null = null) => {
      try {
        const { task: saved } = await api.setFlag(task.id, flag, note, to)
        upsert([saved])
        showToast(flag ? '状況を共有しました' : '状況を解除しました')
      } catch {
        showToast('保存できませんでした')
      }
    },
    [showToast, upsert],
  )

  // --- 通知: 自分宛ての未読を定期的に確認し、増えたら知らせる ---
  const checkNotices = useCallback(async () => {
    if (phaseRef.current !== 'ready') return
    try {
      const { notices, unread: n } = await api.notices()
      if (n > unreadRef.current && notices[0] && !notices[0].read && viewRef.current !== 'people') {
        showToast(notices[0].text)
        // 依頼の完了などで自分のタスクの表示 (待ち → 完了) も変わる
        api.list().then((r) => upsert(r.tasks), () => {})
      }
      unreadRef.current = n
      setUnread(n)
    } catch {}
  }, [showToast, upsert])

  useEffect(() => {
    if (phase !== 'ready') return
    checkNotices()
    const t = setInterval(() => document.visibilityState === 'visible' && checkNotices(), NOTICE_POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && checkNotices()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [phase, checkNotices])

  // --- 選択モード (長押し or 選択ボタン) ---
  const onSelect = useCallback((task: UITask) => {
    setHint(false)
    store.set(HINT_KEY, true)
    setSelected((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(task.id)) next.delete(task.id)
      else next.add(task.id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const bulkMove = useCallback(
    async (list: UITask[], dir: 1 | -1) => {
      // ステータスごとに次 (前) の状態へ。端のものは動かさない
      const groups = new Map<Status, UITask[]>()
      for (const t of list) {
        const i = ORDER.indexOf(t.status) + dir
        if (i < 0 || i >= ORDER.length) continue
        const to = ORDER[i]
        groups.set(to, [...(groups.get(to) ?? []), t])
      }
      if (!groups.size) return
      const now = Date.now()
      upsert([...groups].flatMap(([to, ts]) => ts.map((t, i) => ({ ...t, status: to, position: now - i }))))
      setSelected(null)
      const moved = [...groups.values()].flat()
      try {
        for (const [to, ts] of groups) {
          const r = await api.bulk(
            ts.map((t) => t.id),
            { status: to },
          )
          if (r.tasks) upsert(r.tasks)
          onXp(r.xp ?? null)
        }
        const to = groups.size === 1 ? STATUS_LABEL[[...groups.keys()][0]] : dir > 0 ? '次' : '前'
        showToast(`${moved.length}件を${to}へ`, async () => {
          // 元のステータスごとにまとめて戻す
          const back = new Map<Status, UITask[]>()
          for (const t of moved) back.set(t.status, [...(back.get(t.status) ?? []), t])
          upsert(moved)
          for (const [st, ts] of back) {
            const r = await api.bulk(
              ts.map((t) => t.id),
              { status: st },
            )
            onXp(r.xp ?? null)
          }
        })
      } catch {
        upsert(moved)
        showToast('移動できませんでした')
      }
    },
    [onXp, showToast, upsert],
  )

  /** 選択したものをまとめて完了に (どのステータスからでも) */
  const bulkDone = useCallback(
    async (list: UITask[]) => {
      const targets = list.filter((t) => t.status !== 'done')
      if (!targets.length) return
      const now = Date.now()
      upsert(targets.map((t, i) => ({ ...t, status: 'done' as Status, position: now - i })))
      setSelected(null)
      try {
        const r = await api.bulk(
          targets.map((t) => t.id),
          { status: 'done' },
        )
        if (r.tasks) upsert(r.tasks)
        onXp(r.xp ?? null)
        showToast(`${targets.length}件を完了しました`, async () => {
          upsert(targets)
          for (const st of ['todo', 'doing'] as Status[]) {
            const ts = targets.filter((t) => t.status === st)
            if (ts.length) onXp((await api.bulk(ts.map((t) => t.id), { status: st })).xp ?? null)
          }
        })
        if (targets.some((t) => t.parent)) api.list().then((x) => upsert(x.tasks), () => {})
      } catch {
        upsert(targets)
        showToast('完了にできませんでした')
      }
    },
    [onXp, showToast, upsert],
  )

  const bulkDelete = useCallback(
    async (list: UITask[]) => {
      removeLocal(list.map((t) => t.id))
      setSelected(null)
      try {
        await api.bulk(
          list.map((t) => t.id),
          { delete: true },
        )
        showToast(`${list.length}件を削除しました`, async () => {
          upsert(list)
          for (const src of ['user', 'ai'] as const) {
            const ts = list.filter((t) => (t.source ?? 'user') === src)
            if (ts.length) await api.create(ts, src)
          }
        })
      } catch {
        upsert(list)
        showToast('削除できませんでした')
      }
    },
    [removeLocal, showToast, upsert],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {}
    store.del(CACHE_KEY)
    store.del('flick.user')
    setTasks([])
    setUser(null)
    setPlayer(null)
    setView('me')
    setGuestMemos(pending.read())
    setPhase('guest')
  }, [setView])

  // #タグ: 使われているタグの一覧と、選んだタグでの絞り込み
  const allTags = useMemo(() => [...new Set(tasks.flatMap((t) => tagsOf(t)))].sort((a, b) => a.localeCompare(b, 'ja')), [tasks])
  const activeTag = tagFilter && allTags.includes(tagFilter) ? tagFilter : null
  const shown = useMemo(() => (activeTag ? tasks.filter((t) => tagsOf(t).includes(activeTag)) : tasks), [tasks, activeTag])

  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, done: 0 }
    for (const t of shown) c[t.status]++
    return c
  }, [shown])

  const q = query?.trim().toLowerCase() ?? ''
  const visible = useMemo(() => {
    // 未着手・進行中では、他の人から依頼されたタスクを自分で追加したものより上に固定する
    const pinned = (t: UITask) => (t.requestedBy && t.status !== 'done' ? 1 : 0)
    if (q) {
      // 検索中は全ステータスから。未着手 → 進行中 → 完了 の順
      return shown
        .filter((t) => t.title.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || pinned(b) - pinned(a) || SORT_CMP[sort](a, b))
    }
    // 完了は完了した順のまま
    const column = (s: Status) => {
      const cmp = s === 'done' ? DONE_CMP[doneSort] : SORT_CMP[sort]
      return shown.filter((t) => t.status === s).sort((a, b) => pinned(b) - pinned(a) || cmp(a, b))
    }
    // 横に広い画面では 3 列すべてを並べる
    return wide ? ORDER.flatMap(column) : column(tab)
  }, [shown, tab, q, sort, doneSort, wide])
  const board = wide && !q
  const canReorder = !q && !activeTag && (board || tab !== 'done')

  const saveReorder = async () => {
    const changes = Object.entries(reorder ?? {}) as [Status, string[]][]
    setReorder(null)
    for (const [, ids] of changes) {
      // 上から順に新しい位置 (サーバーと同じ付け方)
      const base = Date.now()
      setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, position: base - ids.indexOf(t.id) } : t)))
      try {
        await api.reorder(ids)
      } catch {
        showToast('並び順を保存できませんでした')
      }
    }
    if (changes.length) showToast('並び順を保存しました')
  }
  const selectedTasks = selected ? visible.filter((t) => selected.has(t.id)) : []
  const selStatuses = new Set(selectedTasks.map((t) => t.status))
  const selStatus = selStatuses.size === 1 ? [...selStatuses][0] : selectedTasks.length === 0 && !q && !board ? tab : null
  const openTask = tasks.find((t) => t.id === openId) ?? null
  const freeSp = player ? Math.max(0, spInfo(player).free) : 0

  return (
    <>
      <Background />
      {/* スケルトン (position: fixed) の退場と本体の表示を同時に行い、待ち時間を作らない */}
      <AnimatePresence>
        {phase === 'loading' && <Skeleton key="skel" />}

        {phase === 'guest' && <Login key="login" memos={guestMemos} />}

        {phase === 'ready' && (
          <motion.div key="app" className="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {/* 画面切り替えは退場アニメーションを待たず即座に描画する (フェードインのみ) */}
            <motion.main key={view} className={`view view-${view} ${board && view === 'me' ? 'board-mode' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
                {view === 'me' && (
                  <>
                    <MeToolbar
                      tab={tab}
                      counts={counts}
                      onChange={setTab}
                      query={query}
                      onQuery={(v) => {
                        setQuery(v)
                        setSelected(null)
                      }}
                      onStartSelect={() => setSelected((s) => (s ? null : new Set()))}
                      extra={canToggle ? <LayoutToggle pc={isPc('me')} onChange={(m) => setLayout('me', m)} label="自分" /> : null}
                    />
                    {hint && !selected && !q && visible.length > 1 && (
                      <div className="hint-bar" data-testid="select-hint">
                        <span>💡 カードを長押しすると複数選択して、まとめて完了・削除できます</span>
                        <button
                          onClick={() => {
                            setHint(false)
                            store.set(HINT_KEY, true)
                          }}
                          aria-label="閉じる"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {allTags.length > 0 && (
                      <div className="tag-row" data-testid="tag-row">
                        <button className={`tag-filter ${activeTag ? '' : 'on'}`} onClick={() => setTagFilter(null)} data-testid="tag-all">
                          すべて
                        </button>
                        {allTags.map((t) => (
                          <button key={t} className={`tag-filter ${activeTag === t ? 'on' : ''}`} onClick={() => setTagFilter(activeTag === t ? null : t)} data-testid="tag-filter">
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                    {(tab !== 'done' || q || board) && visible.length > 1 && (
                      <div className="sort-row" role="radiogroup" aria-label="並び順" data-testid="sort-row">
                        {reorder ? (
                          <>
                            <span className="reorder-hint">≡ をドラッグして並べ替え</span>
                            <button className="sort-btn" onClick={() => setReorder(null)} data-testid="reorder-cancel">
                              やめる
                            </button>
                            <button className="sort-btn on" onClick={saveReorder} data-testid="reorder-save">
                              完了
                            </button>
                          </>
                        ) : (
                          <>
                            {SORTS.map((s) => (
                              <button key={s.key} role="radio" aria-checked={sort === s.key} className={`sort-btn ${sort === s.key ? 'on' : ''}`} onClick={() => setSort(s.key)} data-testid={`sort-${s.key}`}>
                                {s.label}
                              </button>
                            ))}
                            {canReorder && (
                              <button
                                className="sort-btn reorder-btn"
                                onClick={() => {
                                  setSort('new')
                                  setSelected(null)
                                  setReorder({})
                                }}
                                data-testid="reorder-start"
                              >
                                ↕ 並べ替え
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {!board && !q && tab === 'done' && visible.length > 1 && doneSortRow}
                    <TaskBoard
                      board={board}
                      tasks={visible}
                      tab={tab}
                      searching={!!q}
                      reordering={!!reorder}
                      onReorder={(st, ids) => setReorder((r) => ({ ...r, [st]: ids }))}
                      selected={selected}
                      onSwipe={onSwipe}
                      onOpen={(x) => setOpenId(x.id)}
                      onSelect={onSelect}
                      doneSortRow={doneSortRow}
                      onHistory={() => setHistoryOpen(true)}
                    />
                  </>
                )}

                <Suspense fallback={<ViewSkeleton />}>
                {view !== 'me' && canToggle && (
                  <div className="view-head">
                    <LayoutToggle pc={isPc(view)} onChange={(m) => setLayout(view, m)} label={view === 'people' ? 'みんな' : '冒険'} />
                  </div>
                )}
                {view === 'people' && (
                  <People
                    pc={isPc('people')}
                    onXp={onXp}
                    isAdmin={!!user?.isAdmin}
                    toast={showToast}
                    onMeRenamed={(name) => setUser((u) => (u ? { ...u, name } : u))}
                    onNoticesRead={() => {
                      unreadRef.current = 0
                      setUnread(0)
                    }}
                    onOpenMine={(id) => {
                      const t = tasks.find((x) => x.id === id)
                      setView('me')
                      if (t) {
                        setTab(t.status)
                        setOpenId(id)
                      }
                    }}
                    onRequested={() => api.list().then((r) => upsert(r.tasks), () => {})}
                  />
                )}

                {view === 'game' &&
                  (player ? (
                    <Adventure player={player} name={user?.name || user?.email || ''} picture={user?.picture} onPlayer={setPlayer} toast={showToast} onCelebrate={setLevelUp} />
                  ) : (
                    <div className="skel-list">
                      <div className="skel skel-card tall" />
                    </div>
                  ))}
                </Suspense>
            </motion.main>

            {selected && view === 'me' ? (
              <SelectBar
                count={selectedTasks.length}
                total={visible.length}
                status={selStatus}
                onAll={() => setSelected(selectedTasks.length === visible.length ? new Set() : new Set(visible.map((t) => t.id)))}
                onCancel={() => setSelected(null)}
                onMove={(dir) => bulkMove(selectedTasks, dir)}
                onDelete={() => bulkDelete(selectedTasks)}
                onDone={() => bulkDone(selectedTasks)}
                canDone={selectedTasks.some((t) => t.status !== 'done')}
              />
            ) : (
              <Dock
                view={view}
                onChange={setView}
                user={user}
                onLogout={logout}
                badge={freeSp}
                peopleBadge={unread}
                onHistory={() => setHistoryOpen(true)}
                onHelp={() => setHelpOpen(true)}
                onStats={user?.isAdmin ? () => setStatsOpen(true) : undefined}
                theme={theme}
                onTheme={setTheme}
              />
            )}

            <AnimatePresence>
              {openTask && (
                <Sheet
                  key={openTask.id}
                  task={openTask}
                  onClose={(patch) => {
                    setOpenId(null)
                    if (Object.keys(patch).length) patchTask(openTask, patch)
                  }}
                  onStatus={(status) => {
                    if (status === openTask.status) return
                    exitDir.delete(openTask.id)
                    patchTask(openTask, { status, position: Date.now() })
                  }}
                  onDelete={() => {
                    setOpenId(null)
                    exitDir.delete(openTask.id)
                    deleteTask(openTask)
                  }}
                  onAddChildren={(titles, title, note) => onAddChildren(openTask, titles, title, note)}
                  onFlag={(flag, note, to) => onFlag(openTask, flag, note, to)}
                  onWeight={(w) => onWeight(openTask, w)}
                  onPriority={(priority) => patchTask(openTask, { priority })}
                  onRecurring={async (rule) => {
                    try {
                      if (rule) {
                        const { task } = await api.setRecurring(openTask.id, rule)
                        upsert([task])
                        showToast('繰り返しにしました')
                      } else if (openTask.recurring) {
                        await api.stopRecurring(openTask.recurring.id)
                        upsert([{ ...openTask, recurring: null }])
                        showToast('繰り返しをやめました')
                      }
                    } catch {
                      showToast('保存できませんでした')
                    }
                  }}
                  toast={showToast}
                  onDue={async (due) => {
                    const prev = openTask
                    upsert([{ ...openTask, due, dueBy: null }])
                    try {
                      const { task } = await api.setDue(openTask.id, due)
                      upsert([task])
                    } catch {
                      upsert([prev])
                      showToast('期限を保存できませんでした')
                    }
                  }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {layoutGuide && (
                <LayoutGuide
                  onClose={() => {
                    setLayoutGuide(false)
                    if (user) store.set(`flick.hint.layout.${user.id}`, true)
                  }}
                />
              )}
            </AnimatePresence>
            <Suspense fallback={null}>
              <AnimatePresence>{helpOpen && <Help onClose={() => setHelpOpen(false)} />}</AnimatePresence>
              <AnimatePresence>{statsOpen && <AdminStats onClose={() => setStatsOpen(false)} />}</AnimatePresence>
            </Suspense>
            <Suspense fallback={null}>
              <AnimatePresence>{historyOpen && <History onClose={() => setHistoryOpen(false)} toast={showToast} />}</AnimatePresence>
            </Suspense>

            <AnimatePresence>
              {levelUp && (
                <LevelUp
                  data={levelUp}
                  onClose={() => setLevelUp(null)}
                  onGo={() => {
                    setLevelUp(null)
                    setView('game')
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      <XpPops pops={pops} />
      <Toast toast={toast} onDone={clearToast} />
    </>
  )
}
