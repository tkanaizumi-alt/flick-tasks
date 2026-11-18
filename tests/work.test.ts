import { describe, expect, it } from 'vitest'
import { GEAR_SETS, REROLL_GOLD, EFFECT_POOL, NO_BONUS, SET_NEED, computeXp, effectiveStats, rerollEffect, setBonus, setCounts, setOf, type Item, type PlayerState } from '../shared/game'
import { COOP_QUESTS, PET_EVOLVE_GOLD, PET_MAP, coopForWeek, petBonus, petEffect, petMult } from '../shared/extras'
import { CODEX_GEAR, CODEX_REWARDS, codexClaimable, codexOf } from '../shared/collection'
import { ACHIEVEMENT_MAP } from '../shared/achievements'
import { bestGear } from '../shared/optimize'
import { isOntime } from '../worker/game'

const NOW = Date.parse('2026-11-17T12:00:00+09:00')
const base = { weight: 'M' as const, createdAt: NOW - 86400000, now: NOW, doneToday: 1, doneYesterday: false, source: 'user', skills: [] }

describe('仕事ぶりのボーナス', () => {
  it('期限内・依頼でそれぞれ +10%（上乗せの上限とは別）', () => {
    expect(computeXp(base).amount).toBe(20)
    expect(computeXp({ ...base, ontime: true }).amount).toBe(22)
    expect(computeXp({ ...base, requested: true }).amount).toBe(22)
    const both = computeXp({ ...base, ontime: true, requested: true })
    expect(both.amount).toBe(24)
    expect(both.bonuses).toEqual(expect.arrayContaining(['期限内 +10%', '依頼 +10%']))
    // 上乗せが上限 (+100%) に達していても効く
    const capped = computeXp({ ...base, extras: [{ label: 'x', xp: 2 }], ontime: true })
    expect(capped.amount).toBe(44)
  })
  it('期限内かどうか: 前日までに決めた期限を、期限の日までに完了', () => {
    const today = '2026-11-17'
    const yesterday = Date.parse('2026-11-16T15:00:00+09:00')
    expect(isOntime({ due_date: today, due_set_at: yesterday }, NOW)).toBe(true)
    expect(isOntime({ due_date: '2026-11-20', due_set_at: null }, NOW)).toBe(true)
    // 期限切れ
    expect(isOntime({ due_date: '2026-11-16', due_set_at: yesterday }, NOW)).toBe(false)
    // 完了する日に決めた (延ばした) 期限は数えない
    expect(isOntime({ due_date: today, due_set_at: NOW - 3600000 }, NOW)).toBe(false)
    expect(isOntime({ due_date: null, due_set_at: null }, NOW)).toBe(false)
  })
})

const item = (name: string, slot: Item['slot'], extra: Partial<Item> = {}): Item => ({ id: name, slot, name, icon: slot, rarity: 'UR', atk: 10, hp: 50, crit: 2, heal: 1, effect: null, ...extra })
const player = (items: Item[], equipped: PlayerState['equipped']): Pick<PlayerState, 'stats' | 'skills' | 'items' | 'equipped' | 'bonus' | 'stage'> => ({
  stats: { atk: 0, hp: 0, crit: 0, heal: 0 },
  skills: [],
  items,
  equipped,
  bonus: NO_BONUS,
  stage: 10,
})

describe('セット効果', () => {
  const genesis = [item('創世の冠', 'head'), item('創世の鎧', 'body'), item('創世の靴', 'feet'), item('鋼の槍', 'weapon')]
  it('同じシリーズを3部位そろえると発動する', () => {
    expect(setBonus(genesis.slice(0, 2)).count).toBe(0)
    const b = setBonus(genesis)
    expect(b.count).toBe(1)
    expect(b.atk).toBeCloseTo(1.12)
    expect(b.hp).toBeCloseTo(1.06)
    expect(setCounts(genesis)).toEqual([expect.objectContaining({ count: 3, on: true })])
  })
  it('ステータスに乗る', () => {
    const on = player(genesis, { head: '創世の冠', body: '創世の鎧', feet: '創世の靴', weapon: '鋼の槍' })
    const off = player(genesis, { head: '創世の冠', body: '創世の鎧', weapon: '鋼の槍' })
    expect(effectiveStats(on).atk).toBeGreaterThan(effectiveStats(off).atk)
  })
  it('シリーズの名前はどれも装備の名前にある (季節の限定装備のセットも含む)', () => {
    const all = new Set([...CODEX_GEAR.map((g) => g.name)])
    for (const s of GEAR_SETS.filter((x) => !x.event)) for (const n of s.pieces) expect(all.has(n), n).toBe(true)
    expect(GEAR_SETS.filter((x) => x.event).length).toBeGreaterThan(5)
    expect(setOf('覇王の槍')?.id).toBe('overlord')
    for (const s of GEAR_SETS) expect(s.pieces.length).toBeGreaterThanOrEqual(SET_NEED)
  })
  it('おまかせ装備がセットを選ぶ', () => {
    // 1 つずつは弱いが、3 つそろうとセット効果
    const weak = (n: string, slot: Item['slot']) => item(n, slot, { rarity: 'R', atk: 2, hp: 10, crit: 0, heal: 0 })
    const items = [weak('創世の冠', 'head'), weak('創世の鎧', 'body'), weak('創世の靴', 'feet'), item('鉄の兜', 'head', { rarity: 'R', atk: 2, hp: 11, crit: 0, heal: 0 })]
    const p = { ...player(items, {}), job: undefined as any, jobLevel: 1 }
    const best = bestGear(p as any, 8)
    expect(best.equipped.head).toBe('創世の冠')
  })
})

describe('効果の付け直し', () => {
  it('今と違う効果になる', () => {
    for (let r = 0; r < 1; r += 0.1) {
      const e = rerollEffect('weapon', 'first', r)
      expect(e).not.toBe('first')
      expect(EFFECT_POOL.weapon).toContain(e)
    }
    expect(REROLL_GOLD.UR).toBeGreaterThan(REROLL_GOLD.SR)
  })
})

describe('ペットの進化', () => {
  it('★2 で 1.5 倍、★3 で 2 倍', () => {
    expect(petMult(1)).toBe(1)
    expect(petMult(2)).toBe(1.5)
    expect(petMult(3)).toBe(2)
    expect(petMult(9)).toBe(2)
    const chick = PET_MAP.chick
    expect(petBonus(chick, 3).xp).toBeCloseTo(0.06)
    expect(petEffect(chick, 2)).toBe('XP+4.5%')
    expect(PET_EVOLVE_GOLD[1]).toBeLessThan(PET_EVOLVE_GOLD[2])
  })
})

describe('図鑑', () => {
  it('割合とご褒美', () => {
    const empty = codexOf({ names: [], stage: 1, level: 1, ownedSkins: [], achieved: [] })
    expect(empty.pct).toBeLessThan(15)
    // 最初から選べるスキンは載っている
    expect(empty.got).toBeGreaterThan(0)
    const all = codexOf({ names: CODEX_GEAR.map((g) => g.name), stage: 31, level: 99, ownedSkins: ['ghost', 'sushi', 'alien', 'rocket', 'dino', 'crown'], achieved: ['h_night', 'h_twoways', 'h_secret3', 'h_rich', 'h_hero'] })
    expect(all.pct).toBe(100)
    expect(codexClaimable(100, 0)).toHaveLength(CODEX_REWARDS.length)
    expect(codexClaimable(60, 1).map((r) => r.pct)).toEqual([50])
    expect(codexClaimable(60, 2)).toEqual([])
  })
  it('季節の限定装備は割合に数えない', () => {
    const a = codexOf({ names: ['獅子舞の頭'], stage: 1, level: 1, ownedSkins: [], achieved: [] })
    const b = codexOf({ names: [], stage: 1, level: 1, ownedSkins: [], achieved: [] })
    expect(a.got).toBe(b.got)
    expect(a.sections.find((s) => s.key === 'event')!.entries.some((e) => e.got)).toBe(true)
  })
})

describe('協力クエスト', () => {
  it('週ごとに決まり、人数で目標が変わる', () => {
    const q = coopForWeek('2026-11-16', 6)
    expect(q).toEqual(coopForWeek('2026-11-16', 6))
    expect(coopForWeek('2026-11-16', 3).goal).toBeLessThan(q.goal)
    // 6 週で全部の種類が出る
    const ids = new Set(Array.from({ length: COOP_QUESTS.length }, (_, i) => coopForWeek(new Date(Date.parse('2026-11-16') + i * 7 * 86400000).toISOString().slice(0, 10), 6).id))
    expect(ids.size).toBe(COOP_QUESTS.length)
    expect(q.label).toContain(String(q.goal))
  })
})

describe('新しい実績', () => {
  it('称号がある', () => {
    for (const id of ['ontime10', 'ontime50', 'rescue3', 'rescue20', 'coop1', 'coop10', 'set1', 'pet3', 'codex50', 'codex100']) expect(ACHIEVEMENT_MAP[id], id).toBeTruthy()
  })
})

describe('✦ 効果はレア度で強くなる', () => {
  it('SR < SSR < UR。N・R とスキルは SR と同じ', async () => {
    const { EFFECT_VALUES, effectValue, effectLabel, effectValues, BASE_JOBS } = await import('../shared/game')
    for (const [id, v] of Object.entries(EFFECT_VALUES)) {
      expect(v.SR).toBeLessThan(v.SSR)
      expect(v.SSR).toBeLessThan(v.UR)
      expect(effectValue(id, 'N')).toBe(v.SR)
      expect(effectValue(id)).toBe(v.SR)
    }
    expect(effectLabel('wall', 'UR')).toBe('鉄壁: 受けるダメージ-30%')
    expect(effectLabel('first', 'SSR')).toBe('先制: 1ターン目の攻撃×2.5')
    // スキルの鉄壁 (SR 相当) と UR の鉄壁が重なったら強い方
    const w = item('覇王の鎧', 'body', { effect: 'wall', rarity: 'UR' })
    const fx = effectValues({ stats: { atk: 0, hp: 0, crit: 0, heal: 0 }, skills: ['wall'], job: BASE_JOBS[0], items: [w], equipped: { body: w.id } } as never)
    expect(fx.wall).toBe(0.3)
  })
  it('XP・ゴールドの ✦ もレア度の分だけ上がる', () => {
    const base = { weight: 'M' as const, createdAt: 0, now: 10 * 60 * 1000, doneToday: 1, doneYesterday: false, source: 'manual', skills: [] }
    const sr = computeXp({ ...base, effects: { xpup: 0.1, goldup: 0.2 } })
    const ur = computeXp({ ...base, effects: { xpup: 0.15, goldup: 0.3 } })
    expect(ur.amount).toBeGreaterThan(sr.amount)
    expect(ur.gold).toBeGreaterThan(sr.gold)
    expect(ur.bonuses).toContain('装備 XP+15%')
  })
})

describe('装備の打ち直し', () => {
  it('昔の UR を今のステージの強さに上げ直す。下がるステータスはない', async () => {
    const { reforgeStats, canReforge } = await import('../shared/extras')
    const { rollItem } = await import('../shared/game')
    const old = { ...rollItem(1, 26, 'UR', 'body'), plus: 0 }
    const now = reforgeStats(old, 43)
    expect(now.hp).toBeGreaterThan(old.hp)
    expect(now.atk).toBe(0) // 付いていないステータスは付けない
    // 同じステージなら UR+0 は SR+10 より強い
    const sr = (plus: number) => reforgeStats({ ...rollItem(2, 43, 'SR', 'body'), plus, hp: 0, heal: 0, base: undefined }, 43).hp
    expect(now.hp).toBeGreaterThan(sr(10))
    // 強化段階のぶんも上がる
    expect(reforgeStats({ ...old, plus: 5 }, 43).hp).toBeGreaterThan(now.hp)
    // もう今の強さなら打ち直せない。ステージが同じでも平均より上振れしたものは下げない
    expect(canReforge({ ...old, ...now }, 43)).toBe(false)
    const lucky = { ...old, hp: 99999 }
    expect(reforgeStats(lucky, 43).hp).toBe(99999)
  })
})
