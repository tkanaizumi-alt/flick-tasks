/** 管理者だけの操作 */
import { displayName } from '../env'
import { FEED_KINDS } from './people'
import { allowedUsers, router } from '../lib'
import { jstToday, levelInfo } from '../../shared/game'
import { FEATURES } from '../../shared/usage'
import { backupKey, listBackups, makeBackup } from '../backup'

// ---------- 管理者のみ ----------
export const admin = router()
admin.use('*', async (c, next) => {
  if (!c.get('user').isAdmin) return c.json({ error: 'forbidden' }, 403)
  await next()
})

/** 表示名を変更 (自分も含む。空にすると Google の名前に戻る) */
admin.patch('/people/:id/name', async (c) => {
  const id = c.req.param('id')
  const { name } = await c.req.json<{ name?: unknown }>().catch(() => ({ name: '' }))
  const value = typeof name === 'string' ? name.trim().slice(0, 30) : ''
  const r = await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(value || null, id).run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  const user = await c.env.DB.prepare('SELECT name, display_name, email FROM users WHERE id = ?').bind(id).first<any>()
  return c.json({ name: displayName(user) })
})

/** 最近の動きのログを 1 件削除 */
admin.delete('/activity/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM activity WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ ok: true })
})

/** 最近の動きのログをまとめて削除 (?kind= でそのタブの分だけ。all ならタスクに関するログ全部) */
admin.delete('/activity', async (c) => {
  const kind = c.req.query('kind')
  const kinds = kind === 'todo' || kind === 'doing' || kind === 'done' ? [kind] : FEED_KINDS
  const r = await c.env.DB.prepare(`DELETE FROM activity WHERE kind IN (${kinds.map(() => '?').join(',')})`)
    .bind(...kinds)
    .run()
  return c.json({ ok: true, deleted: r.meta.changes ?? 0 })
})

/**
 * 集計 (管理者だけ): 1 人ずつの完了数・XP の増え方・機能の使われ方と、最近のエラー。
 * ゲームのバランス調整やテストのふりかえりに使う
 */
admin.get('/stats', async (c) => {
  const now = Date.now()
  const d7 = now - 7 * 86400000
  const d30 = now - 30 * 86400000
  const db = c.env.DB
  const [tasks, helps, comments, recurring, players, errors, usage30, gold7, goldBy7, since] = await db.batch([
    db
      .prepare(
        `SELECT user_id,
                SUM(xp_awarded > 0 AND done_at >= ?1) AS done7, SUM(xp_awarded > 0 AND done_at >= ?2) AS done30,
                SUM(CASE WHEN done_at >= ?1 THEN xp_awarded ELSE 0 END) AS xp7,
                SUM(created_at >= ?1) AS added7, SUM(status <> 'done') AS open,
                SUM(flag IS NOT NULL AND status <> 'done') AS flags,
                SUM(parent_id IS NOT NULL AND created_at >= ?2) AS split30,
                SUM(requested_by IS NOT NULL AND created_at >= ?2) AS requested30
           FROM tasks GROUP BY user_id`,
      )
      .bind(d7, d30),
    db.prepare('SELECT user_id, COUNT(*) AS n, SUM(xp) AS xp FROM helps WHERE created_at >= ? GROUP BY user_id').bind(d7),
    db.prepare('SELECT user_id, COUNT(*) AS n FROM comments WHERE created_at >= ? GROUP BY user_id').bind(d7),
    db.prepare('SELECT user_id, COUNT(*) AS n FROM recurring GROUP BY user_id'),
    db.prepare('SELECT user_id, xp, stage, gold FROM players'),
    db.prepare('SELECT id, source, path, message, user_id, created_at FROM errors ORDER BY created_at DESC LIMIT 20'),
    // 機能ごとの使われ方 (直近 30 日)
    db.prepare('SELECT feature, COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM usage WHERE created_at >= ? GROUP BY feature').bind(d30),
    // 1 人ずつのゴールドの出入り (直近 7 日)
    db
      .prepare('SELECT user_id, SUM(CASE WHEN gold > 0 THEN gold ELSE 0 END) AS gin, SUM(CASE WHEN gold < 0 THEN -gold ELSE 0 END) AS gout FROM usage WHERE created_at >= ? GROUP BY user_id')
      .bind(d7),
    // 何で稼いで何に使ったか (直近 7 日)
    db.prepare('SELECT feature, SUM(gold) AS gold, COUNT(*) AS n FROM usage WHERE created_at >= ? AND gold <> 0 GROUP BY feature ORDER BY SUM(gold) DESC').bind(d7),
    db.prepare('SELECT MIN(created_at) AS at FROM usage'),
  ])
  const by = (r: D1Result) => new Map((r.results as any[]).map((x) => [x.user_id, x]))
  const [t, h, cm, rc, pl, g7] = [by(tasks), by(helps), by(comments), by(recurring), by(players), by(gold7)]
  const users = await allowedUsers(c.env)
  const names = new Map(users.map((u) => [u.id, u.name]))
  const rows = users
    .map((u) => {
      const x = t.get(u.id) ?? {}
      const p = pl.get(u.id) ?? { xp: 0, stage: 1 }
      return {
        id: u.id,
        name: u.name,
        level: levelInfo(p.xp ?? 0).level,
        stage: p.stage ?? 1,
        done7: x.done7 ?? 0,
        done30: x.done30 ?? 0,
        xp7: (x.xp7 ?? 0) + (h.get(u.id)?.xp ?? 0),
        added7: x.added7 ?? 0,
        open: x.open ?? 0,
        flags: x.flags ?? 0,
        helps7: h.get(u.id)?.n ?? 0,
        comments7: cm.get(u.id)?.n ?? 0,
        split30: x.split30 ?? 0,
        requested30: x.requested30 ?? 0,
        recurring: rc.get(u.id)?.n ?? 0,
        gold: p.gold ?? 0,
        goldIn7: g7.get(u.id)?.gin ?? 0,
        goldOut7: g7.get(u.id)?.gout ?? 0,
      }
    })
    .sort((a, b) => b.done7 - a.done7)
  const done7 = rows.reduce((a, r) => a + r.done7, 0)
  const taskXp7 = rows.reduce((a, r) => a + r.xp7, 0) - [...h.values()].reduce((a, x: any) => a + (x.xp ?? 0), 0)
  return c.json({
    people: rows,
    totals: { done7, xpPerDone: done7 ? Math.round((taskXp7 / done7) * 10) / 10 : 0 },
    // 記録を始めた日時 (これより前の操作は数えていない)
    usageSince: (since.results[0] as any)?.at ?? null,
    features: (() => {
      const used = new Map((usage30.results as any[]).map((u) => [u.feature, u]))
      // 一度も使われていない機能も 0 として出す (整理の候補が分かるように)
      return Object.entries(FEATURES)
        .map(([id, label]) => ({ id, label, n: used.get(id)?.n ?? 0, people: used.get(id)?.people ?? 0 }))
        .sort((a, b) => b.n - a.n)
    })(),
    goldFlow: (goldBy7.results as any[]).map((g) => ({ id: g.feature, label: FEATURES[g.feature] ?? g.feature, gold: g.gold, n: g.n })),
    errors: (errors.results as any[]).map((e) => ({ id: e.id, source: e.source, path: e.path, message: e.message, who: e.user_id ? (names.get(e.user_id) ?? '') : '', at: e.created_at })),
  })
})

// ---------- バックアップ (毎日 3:00 に自動。14 日分) ----------
admin.get('/backups', async (c) => c.json({ backups: await listBackups(c.env), enabled: !!c.env.BACKUP }))

/** 今すぐバックアップを取る (今日の分を上書き) */
admin.post('/backups', async (c) => {
  const bytes = await makeBackup(c.env, jstToday())
  return bytes === null ? c.json({ error: 'バックアップの保存先がありません' }, 400) : c.json({ ok: true, bytes })
})

/** バックアップの JSON をダウンロード */
admin.get('/backups/:day', async (c) => {
  const day = c.req.param('day')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !c.env.BACKUP) return c.json({ error: 'not found' }, 404)
  const body = await c.env.BACKUP.get(backupKey(day))
  if (!body) return c.json({ error: 'not found' }, 404)
  return c.body(body, 200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="flick-backup-${day}.json"` })
})
