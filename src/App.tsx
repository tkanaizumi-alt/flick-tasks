import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { STATUSES, type Status, type Task, type User } from '../shared/types'
import { spInfo, type PlayerState } from '../shared/game'
import { api, HttpError, pending, STATUS_LABEL, type PendingMemo, type XpChange } from './api'
import { Background } from './components/Background'
import { Skeleton } from './components/Skeleton'
import { TaskCard, exitDir } from './components/TaskCard'
import { Dock, type View } from './components/Dock'
import { MeToolbar } from './components/StatusTabs'
import { SelectBar } from './components/SelectBar'
import { Sheet } from './components/Sheet'
import { Toast, type ToastData } from './components/Toast'
import { Login } from './components/Login'
import { LevelUp, XpPops, type Celebration, type XpPopData } from './components/Rewards'
import { CheckCircleIcon, CircleIcon, PlayIcon } from './components/icons'
import { People } from './views/People'
import { Adventure } from './views/Adventure'

export type UITask = Task & { syncing?: boolean; ai?: boolean }
type Phase = 'loading' | 'guest' | 'ready'

const CACHE_KEY = 'flick.cache'
const TAB_KEY = 'flick.tab'
const VIEW_KEY = 'flick.view'
const ORDER: Status[] = ['todo', 'doing', 'done']
const EMPTY_ICON = { todo: CircleIcon, doing: PlayIcon, done: CheckCircleIcon }

const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {}
  },
}

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
  }, [view, phase])

  const showToast = useCallback((text: string, undo?: () => void) => setToastState({ id: Date.now(), text, undo }), [])
  const clearToast = useCallback(() => setToastState(null), [])

  const upsert = useCallback((list: UITask[]) => {
    setTasks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]))
      for (const t of list) map.set(t.id, { ...map.get(t.id), ...t })
      return [...map.values()]
    })
  }, [])
  const removeLocal = useCallback((ids: string[]) => setTasks((prev) => prev.filter((t) => !ids.includes(t.id))), [])

  const onXp = useCallback((xp: XpChange | null) => {
    if (!xp || xp.amount === 0) return
    const id = Date.now() + Math.random()
    setPops((p) => [...p.slice(-2), { id, amount: xp.amount, gold: xp.gold, bonuses: xp.bonuses }])
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1800)
    setPlayer((p) => (p ? { ...p, xp: Math.max(0, p.xp + xp.amount), gold: Math.max(0, p.gold + xp.gold) } : p))
    // 職業 XP なども変わるのでサーバーの状態で取り直す
    api.player().then((r) => setPlayer(r.player), () => {})
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
        const [{ user }, { tasks }, { player }] = await Promise.all([api.me(), api.list(), api.player()])
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
    async (task: UITask, patch: Partial<Pick<Task, 'title' | 'note' | 'status' | 'position'>>) => {
      upsert([{ ...task, ...patch, updatedAt: Date.now() }])
      try {
        const { task: saved, xp } = await api.update(task.id, patch)
        upsert([saved])
        onXp(xp)
      } catch {
        upsert([task])
        showToast('保存できませんでした')
      }
    },
    [onXp, showToast, upsert],
  )

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

  const onBreakdown = useCallback(
    async (task: UITask, title: string, note: string) => {
      // シートは分解後に閉じるので、編集中のタイトル・詳細を先に保存しておく
      const patch: Partial<Pick<Task, 'title' | 'note'>> = {}
      if (title && title !== task.title) patch.title = title
      if (note !== task.note) patch.note = note
      if (Object.keys(patch).length) patchTask(task, patch)
      try {
        const { tasks: titles } = await api.ai('breakdown', note ? `${title}\n${note}` : title)
        if (!titles.length) throw new Error('empty')
        const base = Date.now()
        const { tasks: created } = await api.create(
          titles.map((t, i) => ({ id: crypto.randomUUID(), title: t, status: 'todo' as Status, position: base - i })),
          'ai',
        )
        setOpenId(null)
        if (tabRef.current !== 'todo') setTab('todo')
        created.forEach((t, i) => setTimeout(() => upsert([t]), 200 + i * 70))
        showToast(`${created.length}件に分解`)
      } catch {
        showToast('AIを利用できませんでした')
      }
    },
    [patchTask, setTab, showToast, upsert],
  )

  // --- 選択モード (長押し or 選択ボタン) ---
  const onSelect = useCallback((task: UITask) => {
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

  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, done: 0 }
    for (const t of tasks) c[t.status]++
    return c
  }, [tasks])

  const q = query?.trim().toLowerCase() ?? ''
  const visible = useMemo(() => {
    if (q) {
      // 検索中は全ステータスから。未着手 → 進行中 → 完了 の順
      return tasks
        .filter((t) => t.title.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.position - a.position)
    }
    return tasks.filter((t) => t.status === tab).sort((a, b) => b.position - a.position)
  }, [tasks, tab, q])
  const selectedTasks = selected ? visible.filter((t) => selected.has(t.id)) : []
  const selStatuses = new Set(selectedTasks.map((t) => t.status))
  const selStatus = selStatuses.size === 1 ? [...selStatuses][0] : selectedTasks.length === 0 && !q ? tab : null
  const openTask = tasks.find((t) => t.id === openId) ?? null
  const EmptyIcon = EMPTY_ICON[tab]
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
            <motion.main key={view} className={`view view-${view}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
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
                    />
                    <section className="list-page">
                      <LayoutGroup>
                        <ul className="list" data-testid={`list-${tab}`}>
                          <AnimatePresence mode="popLayout">
                            {visible.map((t, i) => (
                              <TaskCard
                                key={t.id}
                                task={t}
                                index={i}
                                onSwipe={onSwipe}
                                onOpen={(x) => setOpenId(x.id)}
                                selecting={!!selected}
                                selected={!!selected?.has(t.id)}
                                onSelect={onSelect}
                                showStatus={!!q}
                              />
                            ))}
                          </AnimatePresence>
                        </ul>
                      </LayoutGroup>
                      {visible.length === 0 && (
                        <div className={`empty t-${tab}`} data-testid="empty">
                          {q ? <span className="empty-text">見つかりません</span> : <EmptyIcon />}
                        </div>
                      )}
                    </section>
                  </>
                )}

                {view === 'people' && <People />}

                {view === 'game' &&
                  (player ? (
                    <Adventure player={player} name={user?.name || user?.email || ''} picture={user?.picture} onPlayer={setPlayer} toast={showToast} />
                  ) : (
                    <div className="skel-list">
                      <div className="skel skel-card tall" />
                    </div>
                  ))}
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
              />
            ) : (
              <Dock view={view} onChange={setView} user={user} onLogout={logout} badge={freeSp} />
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
                  onBreakdown={(title, note) => onBreakdown(openTask, title, note)}
                />
              )}
            </AnimatePresence>

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
