import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useDragControls } from 'motion/react'
import { FLAGS, PRIORITIES, STATUSES, san, type Flag, type Person, type Priority, type Status } from '../../shared/types'
import { BREAKDOWN_MAX, WEIGHTS, WEIGHT_LABEL, WEIGHT_XP, jstToday, weightChoices, type Weight } from '../../shared/game'
import type { UITask } from '../App'
import { api, HttpError, STATUS_LABEL } from '../api'
import { SparkIcon, TrashIcon } from './icons'
import { DueField } from './DueField'
import { TaskLinks, XpChip } from './TaskMeta'
import { XpGuide } from './XpGuide'
import { Comments } from './Comments'
import { ruleChoices, ruleLabel } from '../../shared/recurring'

interface Props {
  task: UITask
  onClose: (patch: { title?: string; note?: string }) => void
  onStatus: (s: Status) => void
  onDelete: () => void
  /** 確認画面で編集した分解案を子タスクとして追加 */
  onAddChildren: (titles: string[], title: string, note: string) => Promise<void>
  onDue: (due: string | null) => void
  onFlag: (flag: Flag | null, note?: string, to?: string | null) => Promise<void>
  onWeight: (w: Weight) => void
  onPriority: (p: Priority | null) => void
  onRecurring: (rule: string | null) => void
  toast: (text: string) => void
}

export function Sheet({ task, onClose, onStatus, onDelete, onAddChildren, onDue, onFlag, onWeight, onPriority, onRecurring, toast }: Props) {
  const [title, setTitle] = useState(task.title)
  const [note, setNote] = useState(task.note)
  const [busy, setBusy] = useState(false)
  // 分解の確認画面 (null = 閉じている)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [guide, setGuide] = useState(false)
  const [flagEdit, setFlagEdit] = useState<Flag | null>(null)
  const controls = useDragControls()
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const remaining = BREAKDOWN_MAX - (task.children?.total ?? 0)

  const close = () => {
    const patch: { title?: string; note?: string } = {}
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim()
    if (note !== task.note) patch.note = note
    onClose(patch)
  }

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [title])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (guide ? setGuide(false) : close())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const suggest = async () => {
    setBusy(true)
    try {
      const r = await api.breakdown(task.id, title.trim() || task.title, note)
      if (!r.tasks.length) throw new Error('empty')
      setDraft(r.tasks)
    } catch (e) {
      toast(e instanceof HttpError && e.reason && e.status === 400 ? e.reason : 'AIを利用できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const addDraft = async () => {
    const titles = (draft ?? []).map((t) => t.trim()).filter(Boolean)
    if (!titles.length) return
    setBusy(true)
    try {
      await onAddChildren(titles, title.trim() || task.title, note)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div className="scrim" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
      <motion.div
        className="sheet glass"
        role="dialog"
        aria-label="タスク"
        data-testid="sheet"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) close()
        }}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>

        {task.parent?.title && <div className="sheet-parent">↳ 分解元: {task.parent.title}</div>}
        <label className="title-wrap">
          <textarea ref={titleRef} className="sheet-title" value={title} rows={1} onChange={(e) => setTitle(e.target.value)} aria-label="タイトル" data-testid="sheet-title" />
          <span className="edit-hint" aria-hidden="true">
            ✎
          </span>
        </label>
        <textarea className="sheet-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="詳細" rows={3} aria-label="詳細" />

        <div className="sheet-meta">
          <TaskLinks task={task} showFlagNote />
          <XpChip task={task} />
          <button className="link-btn" onClick={() => setGuide(true)} data-testid="xp-guide-open">
            XPの決まり方
          </button>
        </div>
        {task.status !== 'done' && !task.parent && <WeightField task={task} onWeight={onWeight} />}
        {task.requestedBy && task.follow && <p className="sheet-info">📨 {san(task.requestedBy.name)}はこの後「{task.follow.title}」に進みます</p>}

        {task.status !== 'done' && (
          <div className="weight-field prio-field" data-testid="prio-field">
            <span className="due-label">重要度</span>
            {PRIORITIES.map((p) => {
              const on = (task.priority ?? null) === p.key
              return (
                <button key={p.label} className={`weight-btn prio-${p.key ?? 'normal'} ${on ? 'on' : ''}`} disabled={on} onClick={() => onPriority(p.key)} data-testid={`prio-${p.key ?? 'normal'}`}>
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
        <DueField due={task.due ?? null} dueBy={task.dueBy?.name} onChange={onDue} />

        {task.status !== 'done' && <FlagField task={task} editing={flagEdit} onEdit={setFlagEdit} onFlag={onFlag} />}

        {(task.recurring || (task.status !== 'done' && !task.parent && !task.requestedBy)) && (
          <div className="weight-field recur-field" data-testid="recur-field">
            <span className="due-label">🔁 繰り返し</span>
            {task.recurring ? (
              <>
                <b className="recur-now">{ruleLabel(task.recurring.rule)}</b>
                <button className="due-chip clear" onClick={() => onRecurring(null)} data-testid="recur-stop">
                  やめる
                </button>
              </>
            ) : (
              ruleChoices(jstToday()).map((c) => (
                <button key={c.rule} className="weight-btn" onClick={() => onRecurring(c.rule)} data-testid={`recur-${c.rule.split(':')[0]}`}>
                  {c.label}
                </button>
              ))
            )}
            <span className="weight-note">{task.recurring ? '次の日から自動で未着手に追加されます' : '選ぶと、その日になるたびに同じタスクが未着手に追加されます'}</span>
          </div>
        )}

        <Comments taskId={task.id} toast={toast} />

        <div className="seg" role="radiogroup">
          {STATUSES.map((s) => (
            <button key={s} role="radio" aria-checked={task.status === s} className={`seg-btn t-${s} ${task.status === s ? 'on' : ''}`} onClick={() => onStatus(s)} data-testid={`sheet-status-${s}`}>
              {task.status === s && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 36 }} />}
              <span>{STATUS_LABEL[s]}</span>
            </button>
          ))}
        </div>

        {draft ? (
          <section className="draft" data-testid="breakdown-draft">
            <div className="draft-head">
              <b>分解案</b>
              <span className="muted">名前を直したり、いらないものを外せます</span>
            </div>
            <p className="draft-guide">目安: 1件 = 15分〜半日で終わり、報告できる単位。XPは元タスクの分を子タスクで分け合います。</p>
            <ul>
              {draft.map((d, i) => (
                <li key={i}>
                  <span className="draft-no">{i + 1}</span>
                  <input value={d} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`分解案${i + 1}`} data-testid="draft-input" maxLength={200} />
                  <button className="draft-del" onClick={() => setDraft(draft.filter((_, j) => j !== i))} aria-label="外す" data-testid="draft-del">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {draft.length < remaining && (
              <button className="link-btn" onClick={() => setDraft([...draft, ''])} data-testid="draft-add">
                ＋ 行を足す
              </button>
            )}
            <div className="sheet-actions">
              <button className="pill-btn ghost" onClick={() => setDraft(null)} disabled={busy}>
                やめる
              </button>
              <button className="pill-btn primary grow" onClick={addDraft} disabled={busy || !draft.some((d) => d.trim())} data-testid="draft-commit">
                {draft.filter((d) => d.trim()).length}件を追加
              </button>
            </div>
          </section>
        ) : (
          <div className="sheet-actions">
            {task.parent ? (
              <span className="muted grow">分解したタスクはさらに分解できません</span>
            ) : remaining <= 0 ? (
              <span className="muted grow">分解は{BREAKDOWN_MAX}件までです</span>
            ) : (
              <motion.button className={`pill-btn ai ${busy ? 'busy' : ''}`} whileTap={{ scale: 0.95 }} disabled={busy} data-testid="breakdown" onClick={suggest}>
                <SparkIcon />
                <span>{busy ? '分解中' : task.children?.total ? 'AIでさらに分解' : 'AIで分解'}</span>
              </motion.button>
            )}
            <motion.button className="pill-btn danger" whileTap={{ scale: 0.95 }} onClick={onDelete} data-testid="sheet-delete" aria-label="削除">
              <TrashIcon />
            </motion.button>
          </div>
        )}
      </motion.div>
      <AnimatePresence>{guide && <XpGuide onClose={() => setGuide(false)} />}</AnimatePresence>
    </>
  )
}

/** 作業量 (小・中・大) の調整。AI の判定から 1 段階まで */
function WeightField({ task, onWeight }: { task: UITask; onWeight: (w: Weight) => void }) {
  const choices = weightChoices(task.weightAi)
  const current = task.weight ?? null
  return (
    <div className="weight-field" data-testid="weight-field">
      <span className="due-label">大きさ</span>
      {/* 特大は AI が特大と判定したタスクにだけ出す */}
      {WEIGHTS.filter((w) => w !== 'XL' || task.weightAi === 'XL').map((w) => (
        <button
          key={w}
          className={`weight-btn w-${w} ${current === w ? 'on' : ''}`}
          disabled={!choices.includes(w) || current === w}
          onClick={() => onWeight(w)}
          data-testid={`weight-${w}`}
        >
          {WEIGHT_LABEL[w]} <small>+{WEIGHT_XP[w]}</small>
        </button>
      ))}
      <span className="weight-note">
        {task.weightAi ? `AIの判定: ${WEIGHT_LABEL[task.weightAi]}（1段階まで変えられます）` : 'AIが判定中です'}
      </span>
    </div>
  )
}

/** 状況フラグ: 確認待ち (相手を選ぶ) / 困っている / 遅れそう */
function FlagField({
  task,
  editing,
  onEdit,
  onFlag,
}: {
  task: UITask
  editing: Flag | null
  onEdit: (f: Flag | null) => void
  onFlag: Props['onFlag']
}) {
  const [note, setNote] = useState(task.flag?.note ?? '')
  const [to, setTo] = useState<string | null>(task.flag?.to?.id ?? null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing === 'wait' && !people) api.people().then((r) => setPeople(r.people.filter((p) => !p.isMe)), () => setPeople([]))
  }, [editing, people])

  const save = async (flag: Flag | null) => {
    setSaving(true)
    try {
      await onFlag(flag, note, flag === 'wait' ? to : null)
      onEdit(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flag-field" data-testid="flag-field">
      <div className="flag-row">
        <span className="due-label">状況</span>
        {(Object.keys(FLAGS) as Flag[]).map((f) => (
          <button
            key={f}
            className={`flag-btn f-${f} ${task.flag?.kind === f ? 'on' : ''} ${editing === f ? 'editing' : ''}`}
            onClick={() => {
              setNote(task.flag?.kind === f ? task.flag.note : '')
              onEdit(editing === f ? null : f)
            }}
            data-testid={`flag-${f}`}
          >
            {FLAGS[f].icon} {FLAGS[f].label}
          </button>
        ))}
        {task.flag && !editing && (
          <button className="due-chip clear" onClick={() => save(null)} disabled={saving} data-testid="flag-clear">
            解除
          </button>
        )}
      </div>
      {editing && (
        <div className="flag-form">
          {editing === 'wait' && (
            <div className="who-row">
              {people === null ? (
                <span className="muted">読み込み中…</span>
              ) : (
                people.map((p) => (
                  <button key={p.id} className={`who ${to === p.id ? 'on' : ''}`} onClick={() => setTo(to === p.id ? null : p.id)} data-testid="flag-to">
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder={editing === 'wait' ? '何の確認を待っているか（任意）' : editing === 'help' ? '何に困っているか（任意）' : '理由・見込み（任意）'}
            aria-label="ひとこと"
            data-testid="flag-note"
          />
          <button className="pill-btn primary small" onClick={() => save(editing)} disabled={saving || (editing === 'wait' && !to)} data-testid="flag-save">
            {editing === 'wait' && !to ? '相手を選ぶ' : '付ける'}
          </button>
        </div>
      )}
    </div>
  )
}
