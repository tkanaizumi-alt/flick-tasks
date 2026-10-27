import type { Env } from './env'

/** エラーを記録する (Workers Logs にも出す)。記録に失敗しても元の処理は止めない */
export async function recordError(env: Env, e: { source: 'server' | 'client'; path?: string; message: string; stack?: string; userId?: string | null }) {
  console.error(`[${e.source}] ${e.path ?? ''} ${e.message}`, e.stack ?? '')
  try {
    await env.DB.prepare('INSERT INTO errors (source, path, message, stack, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(e.source, (e.path ?? '').slice(0, 300), e.message.slice(0, 500), (e.stack ?? '').slice(0, 2000), e.userId ?? null, Date.now())
      .run()
  } catch {}
}

/** 画面からのエラー報告は 1 人 1 時間 20 件まで */
export async function canLogClient(env: Env, userId: string) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM errors WHERE source = 'client' AND user_id = ? AND created_at >= ?")
    .bind(userId, Date.now() - 3600000)
    .first<{ n: number }>()
  return (r?.n ?? 0) < 20
}
