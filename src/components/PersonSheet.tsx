import { useEffect, useState } from 'react'
import { motion, useDragControls } from 'motion/react'
import { san, type Task } from '../../shared/types'
import { SKILL_MAP, STATS, effectiveStats, equippedItems, type PlayerState } from '../../shared/game'
import { api, STATUS_LABEL } from '../api'
import { CharacterHeader } from './CharacterHeader'
import { GearIcon } from './GearIcon'
import { DueBadge } from './DueBadge'
import { DueField } from './DueField'
import { TaskLinks } from './TaskMeta'

interface Data {
  person: { id: string; name: string; picture: string; isMe?: boolean }
  player: PlayerState
  tasks: Task[]
}

interface Props {
  id: string
  onClose: () => void
  /** 管理者だけ名前を変更できる (自分も含む) */
  canRename?: boolean
  onRenamed?: (id: string, name: string) => void
  /** この人にタスクを依頼する (自分以外) */
  onRequest?: (id: string) => void
  toast?: (text: string) => void
}

/** 他の人のタスクとキャラクター (閲覧のみ。管理者は名前の変更も可) */
export function PersonSheet({ id, onClose, canRename, onRenamed, onRequest, toast }: Props) {
  const [data, setData] = useState<Data | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dueOpen, setDueOpen] = useState<string | null>(null)
  const [savingDue, setSavingDue] = useState(false)
  const controls = useDragControls()

  const saveDue = async (task: Task, due: string | null) => {
    if (!data) return
    setSavingDue(true)
    try {
      const { task: saved } = await api.setDue(task.id, due)
      setData({ ...data, tasks: data.tasks.map((t) => (t.id === saved.id ? saved : t)) })
      toast?.(due ? `期限を${due.slice(5).replace('-', '/')}に設定しました` : '期限を解除しました')
    } catch {
      toast?.('期限を保存できませんでした')
    } finally {
      setSavingDue(false)
    }
  }

  const saveName = async () => {
    if (editing === null || !data) return
    setSaving(true)
    try {
      const { name } = await api.renamePerson(data.person.id, editing)
      setData({ ...data, person: { ...data.person, name } })
      setEditing(null)
      onRenamed?.(data.person.id, name)
      toast?.(`名前を「${name}」に変更しました`)
    } catch {
      toast?.('変更できませんでした')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    api.person(id).then(setData, () => onClose())
  }, [id, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const eff = data ? effectiveStats(data.player) : null

  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass person-sheet"
        role="dialog"
        aria-label="メンバー"
        data-testid="person-sheet"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
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
        {!data ? (
          <div className="skel-list">
            <div className="skel skel-card" />
            <div className="skel skel-card" />
          </div>
        ) : (
          <>
            <CharacterHeader name={data.person.name} picture={data.person.picture} player={data.player} />
            {onRequest && !data.person.isMe && (
              <button className="pill-btn primary small request-btn" onClick={() => onRequest(data.person.id)} data-testid="person-request">
                📨 {san(data.person.name)}にタスクを依頼
              </button>
            )}
            {canRename &&
              (editing === null ? (
                <button className="rename-btn" onClick={() => setEditing(data.person.name)} data-testid="rename-start">
                  ✎ 名前を変更
                </button>
              ) : (
                <form
                  className="rename-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveName()
                  }}
                >
                  <input
                    value={editing}
                    onChange={(e) => setEditing(e.target.value)}
                    maxLength={30}
                    autoFocus
                    aria-label="新しい名前"
                    placeholder="空にすると Google の名前に戻ります"
                    data-testid="rename-input"
                  />
                  <button type="submit" className="pill-btn primary small" disabled={saving} data-testid="rename-save">
                    保存
                  </button>
                  <button type="button" className="pill-btn ghost small" onClick={() => setEditing(null)}>
                    やめる
                  </button>
                </form>
              ))}
            <div className="ps-stats">
              {STATS.map((s) => (
                <span key={s.key}>
                  {s.label} <b>{eff![s.key]}</b>
                </span>
              ))}
            </div>
            {equippedItems(data.player).length > 0 && (
              <div className="ps-skills">
                {equippedItems(data.player).map((i) => (
                  <span key={i.id} className={`chip gear r-${i.rarity}`}>
                    <GearIcon slot={i.slot} rarity={i.rarity} size={14} /> {i.name}
                  </span>
                ))}
              </div>
            )}
            {data.player.skills.length > 0 && (
              <div className="ps-skills">
                {data.player.skills
                  .filter((sid) => SKILL_MAP[sid])
                  .map((sid) => (
                    <span key={sid} className="chip">
                      {SKILL_MAP[sid].name}
                    </span>
                  ))}
                {/* 隠しスキルの名前はサーバーから届いた解放済みの一覧から引く (内部 ID は出さない) */}
                {data.player.secretSkills
                  .filter((s) => s.owned)
                  .map((s) => (
                    <span key={s.id} className="chip secret" data-testid="ps-secret">
                      ✦ {s.name}
                    </span>
                  ))}
              </div>
            )}
            {(['doing', 'todo', 'done'] as const).map((s) => {
              const list = data.tasks.filter((t) => t.status === s)
              const shown = s === 'done' ? list.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 10) : list
              return (
                <section key={s} className="ps-group">
                  <h3 className={`t-${s}`}>
                    {STATUS_LABEL[s]} <span>{list.length}</span>
                  </h3>
                  {shown.length === 0 ? (
                    <p className="ps-empty">—</p>
                  ) : (
                    <ul>
                      {shown.map((t) => (
                        <li key={t.id} className={`ps-task-wrap ${dueOpen === t.id ? 'open' : ''}`}>
                          {/* タップで期限を設定 (他の人のタスクにも設定できる) */}
                          <button className={`ps-task s-${t.status}`} onClick={() => setDueOpen(dueOpen === t.id ? null : t.id)} data-testid="person-task">
                            <span className="status-dot" />
                            <span className="ps-task-body">
                              {t.parent?.title && <span className="ps-parent">↳ {t.parent.title}</span>}
                              <span className="ps-task-title">{t.title}</span>
                              <TaskLinks task={t} showFlagNote />
                              <DueBadge task={t} />
                            </span>
                            <span className="ps-due-hint">{t.due ? '' : '⏰'}</span>
                          </button>
                          {dueOpen === t.id && (
                            <DueField due={t.due ?? null} dueBy={t.dueBy?.name} onChange={(due) => saveDue(t, due)} disabled={savingDue} compact />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </>
        )}
      </motion.div>
    </>
  )
}
