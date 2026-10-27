import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Comment, Person } from '../../shared/types'
import { api } from '../api'
import { Avatar } from './Dock'

const JST = 9 * 3600000
const when = (t: number) => {
  const d = new Date(t + JST)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** タスクへのコメント (自分のタスクにも他の人のタスクにも書ける) */
export function Comments({ taskId, onCount, toast }: { taskId: string; onCount?: (n: number) => void; toast?: (text: string) => void }) {
  const [list, setList] = useState<Comment[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    api.people().then((r) => setPeople(r.people), () => {})
  }, [])
  // 入力中の「@○○」(カーソルの直前) → 候補
  const at = text.match(/[@＠]([^@＠\s]*)$/)
  const candidates = at ? people.filter((p) => !p.isMe && p.name.toLowerCase().startsWith(at[1].toLowerCase())).slice(0, 6) : []
  const pick = (p: Person) => {
    setText(text.replace(/[@＠][^@＠\s]*$/, `@${p.name} `))
    input.current?.focus()
  }

  const load = () =>
    api.comments(taskId).then(
      (r) => {
        setList(r.comments)
        onCount?.(r.comments.length)
      },
      () => setList([]),
    )
  useEffect(() => {
    load()
  }, [taskId])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      await api.addComment(taskId, body)
      setText('')
      await load()
    } catch {
      toast?.('送信できませんでした')
    } finally {
      setSending(false)
    }
  }

  const remove = async (id: number) => {
    setList((l) => l?.filter((c) => c.id !== id) ?? l)
    try {
      await api.deleteComment(id)
      load()
    } catch {
      toast?.('削除できませんでした')
    }
  }

  return (
    <div className="comments" data-testid="comments">
      <div className="due-label">💬 コメント{list?.length ? ` ${list.length}` : ''}</div>
      {list && list.length > 0 && (
        <ul>
          {list.map((c) => (
            <li key={c.id} data-testid="comment">
              <Avatar name={c.user.name} picture={c.user.picture} skin={c.user.skin} size={24} />
              <div className="comment-body">
                <div className="comment-head">
                  <b>{c.user.name}</b>
                  <time>{when(c.createdAt)}</time>
                  {c.mine && (
                    <button className="comment-del" onClick={() => remove(c.id)} aria-label="コメントを削除">
                      ×
                    </button>
                  )}
                </div>
                <div className="comment-text">{highlight(c.text, people)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="mention-list" data-testid="mention-list">
          {candidates.map((p) => (
            <button key={p.id} type="button" className="who" onClick={() => pick(p)} data-testid="mention-pick">
              @{p.name}
            </button>
          ))}
        </div>
      )}
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="ひとこと書く（@名前 でその人に知らせる）"
          aria-label="コメント"
          data-testid="comment-input"
        />
        <button type="submit" className="pill-btn primary small" disabled={sending || !text.trim()} data-testid="comment-send">
          送信
        </button>
      </form>
    </div>
  )
}

/** コメントの中の「@名前」だけ色を付ける */
function highlight(text: string, people: Person[]): ReactNode {
  const names = people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return text
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`([@＠](?:${names.map(esc).join('|')}))`, 'g')
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      part
    ),
  )
}
