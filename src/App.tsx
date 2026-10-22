import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { STATUSES, type Status, type Task, type User } from '../shared/types'
import { api, HttpError, pending, STATUS_LABEL, type PendingMemo } from './api'
import { Background } from './components/Background'
import { Skeleton } from './components/Skeleton'
import { TaskCard, exitDir } from './components/TaskCard'
import { TabBar } from './components/TabBar'
import { Sheet } from './components/Sheet'
import { Toast, type ToastData } from './components/Toast'
import { Login } from './components/Login'
import { CheckCircleIcon, CircleIcon, PlayIcon } from './components/icons'

export type UITask = Task & { syncing?: boolean; ai?: boolean }
type Phase = 'loading' | 'guest' | 'ready'

const CACHE_KEY = 'flick.cache'
const TAB_KEY = 'flick.tab'
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
  const [tasks, setTasks] = useState<UITask[]>([])
  const [tab, setTabState] = useState<Status>(() => {
    const t = store.get<Status>(TAB_KEY, 'todo')
    return STATUSES.includes(t) ? t : 'todo'
  })
  const [tabDir, setTabDir] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToastState] = useState<ToastData | null>(null)
  const [guestMemos, setGuestMemos] = useState<PendingMemo[]>([])
  const [aiBusy, setAiBusy] = useState(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const tabRef = useRef(tab)
  tabRef.current = tab

  const setTab = useCallback((t: Status) => {
    setTabDir(ORDER.indexOf(t) - ORDER.indexOf(tabRef.current))
    setTabState(t)
    store.set(TAB_KEY, t)
  }, [])

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

  // --- 起動: セッション確認とタスク取得 ---
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ user }, { tasks }] = await Promise.all([api.me(), api.list()])
        if (cancelled) return
        setUser(user)
        setTasks(tasks)
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
    if (params.get('login') === 'failed') {
      showToast('ログインに失敗しました')
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
      if (tabRef.current !== 'todo') setTab('todo')
      if (p.ai) {
        upsert([newTask({ id: p.id, title: p.title, position: p.at, ai: true, syncing: true })])
        setAiBusy((n) => n + 1)
        try {
          const { tasks: titles } = await api.ai('split', p.title)
          const base = Date.now()
          const items = titles.map((title, i) => ({ id: `${p.id}-${i}`, title, status: 'todo' as Status, position: base - i }))
          const { tasks: created } = await api.create(items)
          removeLocal([p.id])
          // 少しずつ時間差で降らせる
          created.forEach((t, i) => setTimeout(() => upsert([t]), i * 90))
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
  }, [removeLocal, setTab, showToast, upsert])

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
        const { task: saved } = await api.update(task.id, patch)
        upsert([saved])
      } catch {
        upsert([task])
        showToast('保存できませんでした')
      }
    },
    [showToast, upsert],
  )

  const deleteTask = useCallback(
    async (task: UITask) => {
      removeLocal([task.id])
      showToast('削除しました', async () => {
        exitDir.delete(task.id)
        upsert([task])
        try {
          await api.create([task])
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
        )
        setOpenId(null)
        if (tabRef.current !== 'todo') setTab('todo')
        created.forEach((t, i) => setTimeout(() => upsert([t]), 220 + i * 90))
        showToast(`${created.length}件に分解`)
      } catch {
        showToast('AIを利用できませんでした')
      }
    },
    [patchTask, setTab, showToast, upsert],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {}
    store.del(CACHE_KEY)
    store.del('flick.user')
    setTasks([])
    setUser(null)
    setGuestMemos(pending.read())
    setPhase('guest')
  }, [])

  const counts = useMemo(() => {
    const c = { todo: 0, doing: 0, done: 0 }
    for (const t of tasks) c[t.status]++
    return c
  }, [tasks])

  const visible = useMemo(() => tasks.filter((t) => t.status === tab).sort((a, b) => b.position - a.position), [tasks, tab])
  const openTask = tasks.find((t) => t.id === openId) ?? null
  const EmptyIcon = EMPTY_ICON[tab]

  return (
    <>
      <Background />
      <AnimatePresence mode="wait">
        {phase === 'loading' && <Skeleton key="skel" />}

        {phase === 'guest' && <Login key="login" memos={guestMemos} />}

        {phase === 'ready' && (
          <motion.div key="app" className="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <main className="list-zone">
              <AnimatePresence mode="popLayout" initial={false} custom={tabDir}>
                <motion.section
                  key={tab}
                  className="list-page"
                  custom={tabDir}
                  variants={{
                    enter: (d: number) => ({ x: d * 60, opacity: 0, filter: 'blur(6px)' }),
                    center: { x: 0, opacity: 1, filter: 'blur(0px)' },
                    leave: (d: number) => ({ x: d * -60, opacity: 0, filter: 'blur(6px)' }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="leave"
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                >
                  <LayoutGroup>
                    <ul className="list" data-testid={`list-${tab}`}>
                      <AnimatePresence mode="popLayout">
                        {visible.map((t, i) => (
                          <TaskCard key={t.id} task={t} index={i} onSwipe={onSwipe} onOpen={(x) => setOpenId(x.id)} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </LayoutGroup>
                  <AnimatePresence>
                    {visible.length === 0 && (
                      <motion.div
                        className={`empty t-${tab}`}
                        data-testid="empty"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.15 }}
                      >
                        <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
                          <EmptyIcon />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.section>
              </AnimatePresence>
            </main>

            <TabBar tab={tab} counts={counts} onChange={setTab} user={user} onLogout={logout} />

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
          </motion.div>
        )}
      </AnimatePresence>
      <Toast toast={toast} onDone={clearToast} />
    </>
  )
}
