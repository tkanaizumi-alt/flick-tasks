/** 冒険 (ミニゲーム) */
import { addStat, equipSet, claimAllMissions, claimMission,equipItem, fight, getMissions, getPlayer, learnSkill, openChest, resetBuild, sellItem, setJob, setSkin, setTitle, setPet, enhanceItem, mergeAll, buyShop, buySkin, evolvePet, rerollItem, reforgeItem } from '../game'
import { claimCodex, claimCoop, codexState, coopState } from '../coop'
import { activeTurn, actTurn, startTurn, type TurnKind } from '../turn'
import type { TurnAction } from '../../shared/turn'
import { claimRaid, lastWeekMvp, raidState } from '../raid'
import { eventBossState, fightEventBoss, rematch, rematchState, spar, sparList } from '../arena'
import type { ShopId } from '../../shared/extras'
import { eventProgress, syncAchievements } from '../achievements'
import type { StatKey } from '../../shared/game'
import { allowedUsers, router } from '../lib'

export const game = router()

// ---------- ゲーム ----------
const gameResponse = (c: any, r: { error?: string; player?: unknown }) =>
  r.error ? c.json({ error: r.error }, 400) : c.json({ player: r.player })

/** 自分の状態。新しく取れた実績があれば unlocked で返す (お祝い表示用) */
game.get('/player', async (c) => {
  const userId = c.get('user').id
  const { stats, fresh } = await syncAchievements(c.env.DB, userId)
  return c.json({ player: await getPlayer(c.env.DB, userId), stats, unlocked: fresh })
})

game.post('/player/title', async (c) => {
  const { title } = await c.req.json<{ title?: string | null }>().catch(() => ({ title: null }))
  return gameResponse(c, await setTitle(c.env.DB, c.get('user').id, typeof title === 'string' ? title : null))
})

game.post('/player/stat', async (c) => {
  const { stat } = await c.req.json<{ stat?: StatKey }>().catch(() => ({ stat: undefined }))
  return gameResponse(c, await addStat(c.env.DB, c.get('user').id, stat as StatKey))
})

game.post('/player/skill', async (c) => {
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({ id: '' }))
  const r = await learnSkill(c.env.DB, c.get('user').id, id ?? '')
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/player/reset', async (c) => gameResponse(c, await resetBuild(c.env.DB, c.get('user').id)))

game.post('/player/job', async (c) => {
  const { job } = await c.req.json<{ job?: string }>().catch(() => ({ job: '' }))
  return gameResponse(c, await setJob(c.env.DB, c.get('user').id, job ?? ''))
})

game.post('/player/skin', async (c) => {
  const { skin } = await c.req.json<{ skin?: string | null }>().catch(() => ({ skin: null }))
  return gameResponse(c, await setSkin(c.env.DB, c.get('user').id, typeof skin === 'string' ? skin : null))
})

game.post('/battle', async (c) => c.json(await fight(c.env.DB, c.get('user').id)))

/** ターン制バトル: 続きのバトル / 始める / 1 ターン進める */
game.get('/battle/turn', async (c) => c.json({ battle: await activeTurn(c.env, c.get('user').id) }))
game.post('/battle/turn', async (c) => {
  const { kind, stage } = await c.req.json<{ kind?: TurnKind; stage?: number }>().catch(() => ({}) as { kind?: TurnKind; stage?: number })
  const r = await startTurn(c.env, c.get('user').id, kind ?? 'stage', typeof stage === 'number' ? stage : undefined)
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})
game.post('/battle/turn/:id', async (c) => {
  const { action } = await c.req.json<{ action?: TurnAction }>().catch(() => ({}) as { action?: TurnAction })
  const r = await actTurn(c.env, c.get('user').id, c.req.param('id'), action ?? ('' as TurnAction))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/player/pet', async (c) => {
  const { pet } = await c.req.json<{ pet?: string | null }>().catch(() => ({ pet: null }))
  return gameResponse(c, await setPet(c.env.DB, c.get('user').id, typeof pet === 'string' ? pet : null))
})

/** 持ち物の一括合成 (:id のルートより先に置く) */
game.post('/items/merge-all', async (c) => {
  const r = await mergeAll(c.env.DB, c.get('user').id)
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/items/:id/reforge', async (c) => {
  const r = await reforgeItem(c.env.DB, c.get('user').id, c.req.param('id'))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/items/:id/reroll', async (c) => {
  const r = await rerollItem(c.env.DB, c.get('user').id, c.req.param('id'))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** ペットの進化 (★+1) */
game.post('/pets/:id/evolve', async (c) => {
  const r = await evolvePet(c.env.DB, c.get('user').id, c.req.param('id'))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 図鑑 (手に入れた装備の名前と、受け取ったご褒美の数) */
game.get('/codex', async (c) => c.json(await codexState(c.env.DB, c.get('user').id)))
game.post('/codex/claim', async (c) => {
  const r = await claimCodex(c.env.DB, c.get('user').id)
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 週替わりの協力クエスト */
game.get('/coop', async (c) => c.json(await coopState(c.env, c.get('user').id)))
game.post('/coop/claim', async (c) => {
  const r = await claimCoop(c.env, c.get('user').id)
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/items/:id/enhance', async (c) => {
  const { by, material } = await c.req.json<{ by?: string; material?: string }>().catch(() => ({}) as any)
  return gameResponse(c, await enhanceItem(c.env.DB, c.get('user').id, c.req.param('id'), by === 'gold' ? 'gold' : 'item', typeof material === 'string' ? material : undefined))
})

game.post('/shop/skin/:id', async (c) => gameResponse(c, await buySkin(c.env.DB, c.get('user').id, c.req.param('id'))))

/** 宝箱などのまとめ買いの回数 (省略時は 1) */
const countOf = async (c: { req: { json: <T>() => Promise<T> } }) => {
  const body = await c.req.json<{ count?: unknown }>().catch(() => ({}) as { count?: unknown })
  return body.count === undefined ? 1 : Number(body.count)
}

game.post('/shop/:id', async (c) => {
  const id = c.req.param('id') as ShopId
  const r = await buyShop(c.env.DB, c.get('user').id, id, id === 'treat' ? await allowedUsers(c.env) : [], await countOf(c))
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 今週のレイドボス */
game.get('/raid', async (c) => c.json(await raidState(c.env, c.get('user').id)))
game.post('/raid/claim', async (c) => {
  const r = await claimRaid(c.env, c.get('user').id)
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

/** メンバーと腕試し (練習試合) */
game.get('/spar', async (c) => c.json(await sparList(c.env, c.get('user').id)))
game.post('/spar/:id', async (c) => {
  const r = await spar(c.env, c.get('user').id, c.req.param('id'))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 過去のボスと再戦 */
game.get('/rematch', async (c) => c.json(await rematchState(c.env, c.get('user').id)))
game.post('/rematch/:stage', async (c) => {
  const r = await rematch(c.env, c.get('user').id, Number(c.req.param('stage')))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 季節イベントの限定ボス */
game.get('/event/boss', async (c) => c.json(await eventBossState(c.env, c.get('user').id)))
game.post('/event/boss', async (c) => {
  const r = await fightEventBoss(c.env, c.get('user').id)
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** 先週の MVP */
game.get('/mvp', async (c) => c.json(await lastWeekMvp(c.env)))

/** 開催中の季節イベントと自分の進み具合 */
game.get('/event', async (c) => c.json({ event: await eventProgress(c.env.DB, c.get('user').id) }))

game.post('/chest', async (c) => {
  const r = await openChest(c.env.DB, c.get('user').id, await countOf(c))
  return 'error' in r ? c.json({ error: r.error }, 400) : c.json(r)
})

/** まとめて装備 (おまかせ装備) */
game.post('/equip-set', async (c) => {
  const { equipped } = await c.req.json<{ equipped?: Record<string, string | null> }>().catch(() => ({}) as any)
  if (!equipped || typeof equipped !== 'object') return c.json({ error: 'invalid' }, 400)
  return gameResponse(c, await equipSet(c.env.DB, c.get('user').id, equipped as any))
})

game.post('/items/:id/equip', async (c) => {
  const { on } = await c.req.json<{ on?: boolean }>().catch(() => ({ on: true }))
  return gameResponse(c, await equipItem(c.env.DB, c.get('user').id, c.req.param('id'), on !== false))
})

game.post('/items/:id/sell', async (c) => gameResponse(c, await sellItem(c.env.DB, c.get('user').id, c.req.param('id'))))

game.get('/missions', async (c) => c.json(await getMissions(c.env.DB, c.get('user').id)))

// まとめて受け取る (:id のルートより先に置く)
game.post('/missions/claim-all', async (c) => {
  const r = await claimAllMissions(c.env.DB, c.get('user').id)
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})

game.post('/missions/:id/claim', async (c) => {
  const r = await claimMission(c.env.DB, c.get('user').id, c.req.param('id'))
  return r.error ? c.json({ error: r.error }, 400) : c.json(r)
})
