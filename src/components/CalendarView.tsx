import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { Task } from '../../shared/types'
import { jstToday } from '../../shared/game'

const DAY = 86400000
const WEEK = ['日', '月', '火', '水', '木', '金', '土']
/** YYYY-MM-DD を日数だけずらす */
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
const monthOf = (d: string) => d.slice(0, 7)
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return t.toISOString().slice(0, 7)
}
const label = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日（${WEEK[dow(d)]}）`

interface Props<T extends Task> {
  tasks: T[]
  onOpen: (t: T) => void
  /** その日を期限にしてタスクを追加 */
  onAdd: (title: string, due: string) => void
}

/** 期限のあるタスクを月のカレンダーに並べる。日を選ぶと、その日のタスクの一覧と追加欄が出る */
export function CalendarView<T extends Task>({ tasks, onOpen, onAdd }: Props<T>) {
  const today = jstToday()
  const [month, setMonth] = useState(monthOf(today))
  const [day, setDay] = useState(today)
  const [title, setTitle] = useState('')

  const byDay = useMemo(() => {
    const m = new Map<string, T[]>()
    for (const t of tasks) {
      if (!t.due) continue
      m.set(t.due, [...(m.get(t.due) ?? []), t])
    }
    // 未完了 → 完了、重要度の高い順
    const rank = (t: T) => (t.status === 'done' ? 2 : 0) + (t.priority === 'high' ? -1 : t.priority === 'low' ? 1 : 0)
    for (const list of m.values()) list.sort((a, b) => rank(a) - rank(b))
    return m
  }, [tasks])
  const noDue = tasks.filter((t) => !t.due && t.status !== 'done').length

  // 月の 1 日を含む週の日曜から 6 週分
  const first = `${month}-01`
  const start = shift(first, -dow(first))
  const cells = Array.from({ length: 42 }, (_, i) => shift(start, i))
  const rows = cells.slice(35).some((d) => monthOf(d) === month) ? 6 : 5
  const picked = byDay.get(day) ?? []
  const overdue = (t: T) => t.status !== 'done' && !!t.due && t.due < today

  const move = (n: number) => {
    const next = addMonths(month, n)
    setMonth(next)
    setDay(monthOf(today) === next ? today : `${next}-01`)
  }
  const add = () => {
    const v = title.trim()
    if (!v) return
    onAdd(v, day)
    setTitle('')
  }

  return (
    <div className="cal" data-testid="calendar-view">
      <div className="cal-main glass">
        <div className="cal-head">
          <button className="cal-nav" onClick={() => move(-1)} aria-label="前の月" data-testid="cal-prev">
            ‹
          </button>
          <h2 data-testid="cal-month">
            {month.slice(0, 4)}年{Number(month.slice(5))}月
          </h2>
          <button className="cal-nav" onClick={() => move(1)} aria-label="次の月" data-testid="cal-next">
            ›
          </button>
          {(month !== monthOf(today) || day !== today) && (
            <button
              className="cal-today"
              onClick={() => {
                setMonth(monthOf(today))
                setDay(today)
              }}
              data-testid="cal-today"
            >
              今日
            </button>
          )}
        </div>
        <div className="cal-week">
          {WEEK.map((w, i) => (
            <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
              {w}
            </span>
          ))}
        </div>
        <div className="cal-grid" role="grid" aria-label="カレンダー">
          {cells.slice(0, rows * 7).map((d) => {
            const list = byDay.get(d) ?? []
            const open = list.filter((t) => t.status !== 'done').length
            return (
              <button
                key={d}
                role="gridcell"
                aria-selected={d === day}
                aria-label={`${label(d)} ${list.length}件`}
                className={`cal-cell ${monthOf(d) === month ? '' : 'out'} ${d === today ? 'today' : ''} ${d === day ? 'on' : ''} ${dow(d) === 0 ? 'sun' : dow(d) === 6 ? 'sat' : ''}`}
                onClick={() => setDay(d)}
                data-testid="cal-cell"
                data-date={d}
              >
                <span className="cal-num">{Number(d.slice(8))}</span>
                {list.slice(0, 3).map((t) => (
                  <span key={t.id} className={`cal-chip ${t.status} ${overdue(t) ? 'late' : ''} ${t.priority === 'high' ? 'high' : ''}`}>
                    {t.title}
                  </span>
                ))}
                {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                {/* スマホの狭い枠では件数の点だけ */}
                {list.length > 0 && <span className={`cal-dot ${open ? (list.some(overdue) ? 'late' : '') : 'done'}`}>{list.length}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <motion.section key={day} className="cal-day glass" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14 }} data-testid="cal-day">
        <h3>
          {label(day)}
          {day === today && <em>今日</em>}
          <span className="muted">{picked.length}件</span>
        </h3>
        {picked.length === 0 ? (
          <p className="muted cal-empty">この日が期限のタスクはありません</p>
        ) : (
          <ul className="cal-list">
            {picked.map((t) => (
              <li key={t.id}>
                <button className={`cal-item ${t.status} ${overdue(t) ? 'late' : ''}`} onClick={() => onOpen(t)} data-testid="cal-item">
                  <span className={`cal-status s-${t.status}`}>{t.status === 'done' ? '完了' : t.status === 'doing' ? '進行中' : '未着手'}</span>
                  <span className="cal-title">{t.title}</span>
                  {t.priority === 'high' && <span className="prio-chip p-high">重要度 高</span>}
                  {overdue(t) && <span className="cal-late">期限切れ</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="cal-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} placeholder={`${label(day)}が期限のタスクを追加`} aria-label="この日が期限のタスクを追加" data-testid="cal-add-input" />
          <button type="submit" className="pill-btn primary small" disabled={!title.trim()} data-testid="cal-add">
            追加
          </button>
        </form>
        {noDue > 0 && <p className="muted cal-note">期限のない未完了のタスク {noDue}件は、カレンダーには出ません（リスト表示で見られます）</p>}
      </motion.section>
    </div>
  )
}
