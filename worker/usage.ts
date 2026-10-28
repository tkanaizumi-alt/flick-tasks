/** 機能の使われ方とゴールドの増減を記録する (管理者の集計用) */
import type { MiddlewareHandler } from 'hono'
import type { Env, Vars } from './env'

/** [メソッド, パス, 機能名]。上から順に最初に合ったもの */
const ROUTES: [string, RegExp, string][] = [
  ['POST', /^\/tasks$/, 'task_add'],
  ['PATCH', /^\/tasks\/[^/]+$/, 'task_edit'],
  ['DELETE', /^\/tasks\/[^/]+$/, 'task_delete'],
  ['PUT', /^\/tasks\/[^/]+\/due$/, 'due'],
  ['PUT', /^\/tasks\/[^/]+\/flag$/, 'flag'],
  ['PUT', /^\/tasks\/[^/]+\/weight$/, 'weight'],
  ['POST', /^\/tasks\/[^/]+\/breakdown$/, 'breakdown'],
  ['POST', /^\/tasks\/[^/]+\/move$/, 'move'],
  ['POST', /^\/tasks\/[^/]+\/recurring$/, 'recurring'],
  ['POST', /^\/tasks\/[^/]+\/comments$/, 'comment'],
  ['POST', /^\/tasks\/reorder$/, 'reorder'],
  ['POST', /^\/tasks\/bulk$/, 'bulk'],
  ['POST', /^\/ai\//, 'ai'],
  ['POST', /^\/requests$/, 'request'],
  ['GET', /^\/history$/, 'history'],
  ['GET', /^\/history\/search$/, 'search'],
  ['POST', /^\/history\/report$/, 'report'],
  ['POST', /^\/battle$/, 'battle'],
  ['POST', /^\/chest$/, 'chest'],
  ['POST', /^\/items\/[^/]+\/sell$/, 'sell'],
  ['POST', /^\/items\/[^/]+\/equip$/, 'equip'],
  ['POST', /^\/items\/[^/]+\/enhance$/, 'enhance'],
  ['POST', /^\/shop\/skin\//, 'skin_buy'],
  ['POST', /^\/shop\/(boost|srchest|bag|treat)$/, 'shop'],
  ['POST', /^\/player\/skin$/, 'skin'],
  ['POST', /^\/player\/pet$/, 'pet'],
  ['POST', /^\/player\/title$/, 'title'],
  ['POST', /^\/player\/job$/, 'job'],
  ['POST', /^\/player\/(stat|skill|reset)$/, 'stat'],
  ['POST', /^\/missions\/[^/]+\/claim$/, 'mission'],
  ['POST', /^\/raid\/claim$/, 'raid'],
  ['POST', /^\/spar\/[^/]+$/, 'spar'],
  ['POST', /^\/event\/boss$/, 'event_boss'],
]

export function featureOf(method: string, path: string) {
  for (const [m, re, f] of ROUTES) {
    if (m !== method) continue
    const hit = path.match(re)
    if (!hit) continue
    return f === 'shop' ? `shop_${hit[1]}` : f
  }
  return null
}

export const track = (db: D1Database, userId: string, feature: string, gold = 0) =>
  db.prepare('INSERT INTO usage (user_id, feature, gold, created_at) VALUES (?, ?, ?, ?)').bind(userId, feature, gold, Date.now())

const goldOf = async (db: D1Database, userId: string) => (await db.prepare('SELECT gold FROM players WHERE user_id = ?').bind(userId).first<{ gold: number }>())?.gold ?? 0

/**
 * 成功した操作を記録する。ゴールドが動く操作 (冒険・タスクの完了) は前後の所持ゴールドの差も残す。
 * 記録に失敗しても操作そのものには影響させない
 */
export const usageLog: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const path = new URL(c.req.url).pathname.replace(/^\/api/, '')
  const feature = featureOf(c.req.method, path)
  if (!feature) return next()
  const user = c.get('user')
  const money = c.req.method !== 'GET' && !/^\/(history|requests|ai)/.test(path)
  const before = money ? await goldOf(c.env.DB, user.id).catch(() => null) : null
  await next()
  if (c.res.status >= 400) return
  c.executionCtx.waitUntil(
    (async () => {
      const gold = before === null ? 0 : (await goldOf(c.env.DB, user.id)) - before
      // タスクを完了にしてゴールドが入ったときは「完了」、完了を戻して減ったときは「完了を戻す」として数える
      const f = feature === 'task_edit' && gold > 0 ? 'task_done' : feature === 'task_edit' && gold < 0 ? 'task_undo' : feature === 'enhance' && gold < 0 ? 'enhance_gold' : feature
      await track(c.env.DB, user.id, f, gold).run()
    })().catch((e) => console.error('usage log failed', e)),
  )
}
