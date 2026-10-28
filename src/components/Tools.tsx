import { useEffect, useState, type ReactNode } from 'react'
import { motion, useDragControls } from 'motion/react'
import { api, HttpError, type Template } from '../api'

/** 下から出るシート (下に引くと閉じる / Esc で閉じる) */
function SheetFrame({ label, testId, onClose, children }: { label: string; testId: string; onClose: () => void; children: ReactNode }) {
  const controls = useDragControls()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass tool-sheet"
        role="dialog"
        aria-label={label}
        data-testid={testId}
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
        {children}
      </motion.div>
    </>
  )
}

const reason = (e: unknown, fallback: string) => (e instanceof HttpError && e.reason && e.status === 400 ? e.reason : fallback)

/**
 * テンプレート: よく使うタスクのまとまりを保存して、1 回で追加する。
 * initial があれば (選んだタスクから作るとき) 新規作成の欄に入れておく
 */
export function TemplatesSheet({
  onClose,
  toast,
  onApply,
  initial,
}: {
  onClose: () => void
  toast: (text: string) => void
  onApply: (items: string[], name: string) => void
  initial?: string[]
}) {
  const [list, setList] = useState<Template[] | null>(null)
  const [name, setName] = useState('')
  const [lines, setLines] = useState((initial ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.templates().then(
      (r) => setList(r.templates),
      () => setList([]),
    )
  }, [])
  const items = lines
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const save = async () => {
    setBusy(true)
    try {
      const { template } = await api.createTemplate(name.trim(), items)
      setList((l) => [...(l ?? []), template])
      setName('')
      setLines('')
      toast(`テンプレート「${template.name}」を保存しました`)
    } catch (e) {
      toast(reason(e, '保存できませんでした'))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (t: Template) => {
    setList((l) => (l ?? []).filter((x) => x.id !== t.id))
    try {
      await api.deleteTemplate(t.id)
    } catch {
      setList((l) => [...(l ?? []), t])
      toast('削除できませんでした')
    }
  }

  return (
    <SheetFrame label="テンプレート" testId="templates" onClose={onClose}>
      <h2 className="sheet-h">📋 テンプレート</h2>
      <p className="muted">「月末の締め」のように、毎回同じ数件のタスクを保存しておき、ボタン1つでまとめて追加できます。</p>
      {list === null ? (
        <div className="skel skel-card" />
      ) : list.length === 0 ? (
        <p className="muted tpl-empty">まだありません。下から作れます。</p>
      ) : (
        <ul className="tpl-list">
          {list.map((t) => (
            <li key={t.id} className="tpl" data-testid="template">
              <div className="tpl-body">
                <b>{t.name}</b>
                <span className="muted">
                  {t.items.length}件 ・ {t.items.slice(0, 3).join('、')}
                  {t.items.length > 3 ? ' …' : ''}
                </span>
              </div>
              <button className="pill-btn primary small" onClick={() => onApply(t.items, t.name)} data-testid="template-apply">
                追加する
              </button>
              <button className="pill-btn ghost small" onClick={() => remove(t)} aria-label={`${t.name}を削除`} data-testid="template-delete">
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="tool-h">新しいテンプレート</h3>
      <input className="tool-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="名前（例: 月末の締め）" aria-label="テンプレートの名前" data-testid="template-name" />
      <textarea
        className="tool-input"
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        rows={5}
        placeholder={'1行に1件\n例:\n請求書を発行する\n経費精算を締める'}
        aria-label="テンプレートのタスク"
        data-testid="template-items"
      />
      <button className="pill-btn primary" disabled={busy || !name.trim() || !items.length} onClick={save} data-testid="template-save">
        保存（{items.length}件）
      </button>
    </SheetFrame>
  )
}

/** カレンダー配信: 期限のある自分のタスクを Google カレンダーなどに出す */
export function CalendarSheet({ onClose, toast }: { onClose: () => void; toast: (text: string) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.calendar().then(
      (r) => setUrl(r.url),
      () => setUrl(null),
    )
  }, [])
  const make = async () => {
    setBusy(true)
    try {
      setUrl((await api.makeCalendar()).url)
    } catch {
      toast('作れませんでした')
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    setBusy(true)
    try {
      await api.stopCalendar()
      setUrl(null)
      toast('カレンダーへの表示を止めました')
    } catch {
      toast('止められませんでした')
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url ?? '')
      toast('URLをコピーしました')
    } catch {
      toast('コピーできませんでした')
    }
  }

  return (
    <SheetFrame label="カレンダーに表示" testId="calendar" onClose={onClose}>
      <h2 className="sheet-h">📅 カレンダーに表示</h2>
      <p className="muted">期限を付けた自分の未完了タスクが、Googleカレンダーなどに終日の予定として出ます。完了すると消えます。</p>
      {url === undefined ? (
        <div className="skel skel-card" />
      ) : url === null ? (
        <button className="pill-btn primary" disabled={busy} onClick={make} data-testid="calendar-make">
          カレンダー用のURLを作る
        </button>
      ) : (
        <>
          <div className="cal-url">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="カレンダーのURL" data-testid="calendar-url" />
            <button className="pill-btn primary small" onClick={copy} data-testid="calendar-copy">
              コピー
            </button>
          </div>
          <ol className="cal-steps">
            <li>パソコンでGoogleカレンダーを開く</li>
            <li>左の「他のカレンダー」の「＋」→「URLで追加」</li>
            <li>このURLを貼り付けて「カレンダーを追加」</li>
          </ol>
          <p className="muted">
            Googleカレンダーへの反映は、数時間おきです（すぐには変わりません）。このURLを知っている人は誰でも予定を見られるので、人に渡さないでください。
          </p>
          <div className="cal-actions">
            <button className="pill-btn ghost small" disabled={busy} onClick={make} data-testid="calendar-reset">
              URLを作り直す（前のURLは使えなくなる）
            </button>
            <button className="pill-btn ghost small" disabled={busy} onClick={stop} data-testid="calendar-stop">
              表示を止める
            </button>
          </div>
        </>
      )}
    </SheetFrame>
  )
}
