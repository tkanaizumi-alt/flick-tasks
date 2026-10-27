import { describe, expect, it } from 'vitest'
import { EVENTS, PETS, activeEvent, battleAdvice, hasEventSkin, mondayOf, plusUp, raidForWeek, srChestRarity } from '../shared/extras'
import { computeXp, enemyForStage, type BattleResult } from '../shared/game'

describe('ゲームの追加要素', () => {
  it('レイド: 週ごとに決まったボス、HP は人数 × 250', () => {
    expect(mondayOf('2026-10-27')).toBe('2026-10-26')
    expect(mondayOf('2026-11-01')).toBe('2026-10-26') // 日曜
    const a = raidForWeek('2026-10-26', 6)
    expect(a.hp).toBe(1500)
    expect(raidForWeek('2026-10-26', 6)).toEqual(a)
    expect(raidForWeek('2026-11-02', 6).name).not.toBe(a.name)
  })
  it('季節イベント: 期間中だけ開催、年ごとに記録', () => {
    expect(activeEvent('2026-10-27')?.id).toBe('halloween')
    expect(activeEvent('2026-10-27')?.key).toBe('ev_halloween_2026')
    expect(activeEvent('2026-11-05')).toBeNull()
    expect(hasEventSkin(['ev_halloween_2025'], 'halloween')).toBe(true)
    expect(EVENTS.every((e) => e.from <= e.to)).toBe(true)
  })
  it('強化は +10% (最低 +1)、0 は 0 のまま', () => {
    expect(plusUp(50)).toBe(55)
    expect(plusUp(3)).toBe(4)
    expect(plusUp(0)).toBe(0)
  })
  it('SR 以上確定の宝箱', () => {
    expect(srChestRarity(0.1)).toBe('SSR')
    expect(srChestRarity(0.5)).toBe('SR')
    expect(srChestRarity(0.01)).toBe('UR')
  })
  it('ペット・イベント・XP2倍チケットは XP とゴールドに上乗せ', () => {
    const now = Date.UTC(2026, 9, 27, 3)
    const base = { weight: 'M' as const, createdAt: now - 3600_000, now, doneToday: 1, doneYesterday: false, source: 'user', skills: [] }
    expect(computeXp(base).amount).toBe(20)
    expect(computeXp({ ...base, extras: [{ label: '🎫XP2倍', double: true }] }).amount).toBe(40)
    // 上乗せは合計 +100% まで。2 倍チケットはその後にかかる
    const many = [0.3, 0.3, 0.3, 0.3].map((xp, i) => ({ label: `b${i}`, xp }))
    expect(computeXp({ ...base, extras: many }).amount).toBe(40)
    expect(computeXp({ ...base, extras: [...many, { label: '🎫XP2倍', double: true }] }).amount).toBe(80)
    const pet = PETS.find((p) => p.id === 'kitten')!
    expect(computeXp({ ...base, extras: [{ label: pet.name, gold: pet.gold }] }).gold).toBe(11)
    const byAch = PETS.filter((p) => p.need.stat === 'achievements').map((p) => p.need.goal)
    expect(byAch).toEqual([...byAch].sort((a, b) => a - b))
    expect(PETS).toHaveLength(12)
    expect(new Set(PETS.map((p) => p.id)).size).toBe(12)
  })
  it('負けたときのアドバイス', () => {
    const enemy = enemyForStage(5)
    const lose = (enemyHp: number, turns = 3): BattleResult => ({
      win: false,
      maxHp: 100,
      enemy,
      turns: Array.from({ length: turns }, (_, i) => ({ turn: i + 1, hits: [], taken: 0, dodged: false, healed: 0, guts: false, revive: false, hp: 0, enemyHp })),
    })
    expect(battleAdvice({ ...lose(0), win: true })).toBeNull()
    expect(battleAdvice(lose(enemy.hp * 0.8))).toContain('攻撃が大きく不足')
    expect(battleAdvice(lose(enemy.hp * 0.4))).toContain('もう少し')
    expect(battleAdvice(lose(enemy.hp * 0.1))).toContain('あと一押し')
    expect(battleAdvice(lose(enemy.hp * 0.5, 30))).toContain('時間切れ')
  })
})
