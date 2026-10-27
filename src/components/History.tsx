import { useEffect, useMemo, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { tagsOf, type Task } from '../../shared/types'
import { WEIGHT_LABEL, jstToday } from '../../shared/game'
import { api, HttpError } from '../api'
import { SparkIcon } from './icons'

const DAY = 86400000
const JST = 9 * 3600000

/** YYYY-MM-DD を日数だけずらす */
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
const jstDate = (t: number) => new Date(t + JST).toISOString().slice(0, 10)
const jstTime = (t: number) => new Date(t + JST).toISOString().slice(11, 16)
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const WEEK = ['日', '月', '火', '水', '木', '金', '土']

type Preset = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'lastmonth' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'week', label: '今週' },
  { key: 'lastweek', label: '先週' },
  { key: 'month', label: '今月' },
  { key: 'lastmonth', label: '先月' },
  { key: 'custom', label: '期間を指定' },
]

function rangeOf(p: Preset): [string, string] {
  const today = jstToday()
  const monday = shift(today, -((weekday(today) + 6) % 7))
  const first = `${today.slice(0, 8)}01`
  switch (p) {
    case 'yesterday':
      return [shift(today, -1), shift(today, -1)]
    case 'week':
      return [monday, today]
    case 'lastweek':
      return [shift(monday, -7), shift(monday, -1)]
    case 'month':
      return [first, today]
    case 'lastmonth': {
      const end = shift(first, -1)
      return [`${end.slice(0, 8)}01`, end]
    }
    default:
      return [today, today]
  }
}

/** CSV の 1 セル (Excel でそのまま開けるよう全部 "" で囲む) */
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

function toCsv(tasks: Task[]) {
  const head = ['完了日', '完了時刻', 'タスク', '詳細', 'タグ', '分解元', '大きさ', '獲得XP', '期限', '依頼した人']
  const rows = tasks.map((t) => {
    const at = t.doneAt ?? t.updatedAt
    return [jstDate(at), jstTime(at), t.title, t.note, tagsOf(t).map((x) => '#' + x).join(' '), t.parent?.title ?? '', t.weight ? WEIGHT_LABEL[t.weight] : '', t.xpAwarded ?? 0, t.due ?? '', t.requestedBy?.name ?? '']
  })
  // 先頭の BOM で Excel が UTF-8 と認識する
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

/** 完了タスクの履歴: 期間を選んで一覧 → CSV 保存 / AI で日報の下書き */
export function History({ onClose, toast }: { onClose: () => void; toast: (text: string) => void }) {
  const [preset, setPreset] = useState<Preset>('today')
  const [[from, to], setRange] = useState<[string, string]>(() => rangeOf('today'))
  const [all, setAll] = useState<Task[] | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const allTags = useMemo(() => [...new Set((all ?? []).flatMap((t) => tagsOf(t)))].sort((a, b) => a.localeCompare(b, 'ja')), [all])
  // タグで絞り込むと、一覧・CSV・コピー・AI 日報すべてがそのタグの分だけになる
  const tasks = useMemo(() => (all && tag && allTags.includes(tag) ? all.filter((t) => tagsOf(t).includes(tag)) : all), [all, tag, allTags])
  const [report, setReport] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const controls = useDragControls()
  const [reports, setReports] = useState<{ id: number; from: string; to: string; text: string }[]>([])
  const [openReport, setOpenReport] = useState<number | null>(null)
  useEffect(() => {
    api.reports().then((r) => setReports(r.reports), () => {})
  }, [])

  useEffect(() => {
    let alive = true
    setAll(null)
    setReport(null)
    if (from > to) return
    api.history(from, to).then(
      (r) => alive && setAll(r.tasks),
      () => alive && setAll([]),
    )
    return () => {
      alive = false
    }
  }, [from, to])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of [...(tasks ?? [])].reverse()) {
      const d = jstDate(t.doneAt ?? t.updatedAt)
      m.set(d, [...(m.get(d) ?? []), t])
    }
    return [...m]
  }, [tasks])

  const pick = (p: Preset) => {
    setPreset(p)
    if (p !== 'custom') setRange(rangeOf(p))
  }

  const download = () => {
    if (!tasks?.length) return
    const url = URL.createObjectURL(new Blob([toCsv(tasks)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `flick-完了タスク_${from}${from === to ? '' : `_${to}`}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('コピーしました')
    } catch {
      toast('コピーできませんでした')
    }
  }

  const plainList = () =>
    groups.map(([d, ts]) => `■ ${md(d)}（${WEEK[weekday(d)]}）\n${ts.map((t) => `・${t.parent ? `${t.parent.title} > ` : ''}${t.title}`).join('\n')}`).join('\n\n')

  const makeReport = async () => {
    setBusy(true)
    try {
      setReport((await api.report(from, to, tag && allTags.includes(tag) ? tag : null)).text)
    } catch (e) {
      toast(e instanceof HttpError && e.reason && e.status === 400 ? e.reason : 'AIを利用できませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass history"
        role="dialog"
        aria-label="履歴"
        data-testid="history"
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
        <h2 className="sheet-h">完了タスクの履歴</h2>
        {reports.length > 0 && (
          <section className="weekly" data-testid="weekly">
            <h3>📝 週のふりかえり（毎週金曜の夕方にAIが作成）</h3>
            <ul>
              {reports.map((r) => (
                <li key={r.id}>
                  <button className="weekly-head" onClick={() => setOpenReport(openReport === r.id ? null : r.id)} data-testid="weekly-item">
                    {md(r.from)} 〜 {md(r.to)} <span>{openReport === r.id ? '閉じる' : '開く'}</span>
                  </button>
                  {openReport === r.id && (
                    <div className="report">
                      <textarea readOnly value={r.text} rows={9} aria-label="週のふりかえり" />
                      <button className="pill-btn primary small" onClick={() => copy(r.text)}>
                        コピー
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button key={p.key} className={`preset ${preset === p.key ? 'on' : ''}`} onClick={() => pick(p.key)} data-testid={`preset-${p.key}`}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="range-row">
            <input type="date" value={from} max={jstToday()} onChange={(e) => e.target.value && setRange([e.target.value, to])} aria-label="開始日" data-testid="range-from" />
            <span>〜</span>
            <input type="date" value={to} max={jstToday()} onChange={(e) => e.target.value && setRange([from, e.target.value])} aria-label="終了日" data-testid="range-to" />
          </div>
        )}
        {allTags.length > 0 && (
          <div className="tag-row" data-testid="history-tags">
            <button className={`tag-filter ${tag && allTags.includes(tag) ? '' : 'on'}`} onClick={() => setTag(null)}>
              すべて
            </button>
            {allTags.map((t) => (
              <button key={t} className={`tag-filter ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
        <div className="history-bar">
          <span className="muted">
            {md(from)}
            {from === to ? '' : ` 〜 ${md(to)}`} ・ <b data-testid="history-count">{tasks?.length ?? '…'}</b>件
          </span>
          <button className="pill-btn ghost small" disabled={!tasks?.length} onClick={() => copy(plainList())} data-testid="history-copy">
            テキストでコピー
          </button>
          <button className="pill-btn ghost small" disabled={!tasks?.length} onClick={download} data-testid="history-csv">
            CSVで保存
          </button>
        </div>
        <button className={`pill-btn ai report-btn ${busy ? 'busy' : ''}`} disabled={busy || !tasks?.length} onClick={makeReport} data-testid="history-report">
          <SparkIcon />
          <span>{busy ? '作成中' : 'AIで日報・月報の下書きを作る'}</span>
        </button>
        {report && (
          <div className="report" data-testid="report">
            <textarea value={report} onChange={(e) => setReport(e.target.value)} rows={10} aria-label="日報の下書き" />
            <button className="pill-btn primary small" onClick={() => copy(report)}>
              コピー
            </button>
          </div>
        )}
        {tasks === null ? (
          <div className="skel-list">
            <div className="skel skel-card" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="muted feed-empty">この期間に完了したタスクはありません</p>
        ) : (
          groups.map(([d, ts]) => (
            <section key={d} className="history-day">
              <h3>
                {md(d)}（{WEEK[weekday(d)]}） <span>{ts.length}件</span>
              </h3>
              <ul>
                {ts.map((t) => (
                  <li key={t.id} data-testid="history-item">
                    <time>{jstTime(t.doneAt ?? t.updatedAt)}</time>
                    <span className="history-title">
                      {t.parent?.title && <small>{t.parent.title} › </small>}
                      {t.title}
                    </span>
                    {!!t.xpAwarded && <span className="xp-chip done">+{t.xpAwarded}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </motion.div>
    </>
  )
}
