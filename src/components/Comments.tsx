import { useEffect, useState } from 'react'
import type { Comment } from '../../shared/types'
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
                <div className="comment-text">{c.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="comment-form"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="ひとこと書く" aria-label="コメント" data-testid="comment-input" />
        <button type="submit" className="pill-btn primary small" disabled={sending || !text.trim()} data-testid="comment-send">
          送信
        </button>
      </form>
    </div>
  )
}
