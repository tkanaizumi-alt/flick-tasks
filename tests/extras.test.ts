import { describe, expect, it } from 'vitest'
import { EVENTS, PETS, activeEvent, bagPrice, battleAdvice, enhanceGold, eventBoss, eventGearRarity, REMATCH_DAILY, rematchGold, hasEventSkin, mondayOf, plusUp, raidForWeek, shopPrice, srChestRarity } from '../shared/extras'
import { INVENTORY_MAX, SKINS, computeXp, duelRate, effectiveStats, enemyForStage, invMax, simulateDuel, skinUnlocked, type BattleResult } from '../shared/game'

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
  it('ゴールドの使い道: 持ち物の枠・強化・スキン', () => {
    expect([0, 10, 20].map(bagPrice)).toEqual([300, 600, 900])
    expect(shopPrice('bag', 10)).toBe(600)
    expect(shopPrice('treat')).toBe(300)
    expect(invMax({ invExtra: 20 })).toBe(INVENTORY_MAX + 20)
    expect(enhanceGold('N', 0)).toBe(30)
    expect(enhanceGold('UR', 4)).toBe(2500)
    const ghost = SKINS.find((s) => s.id === 'ghost')!
    expect(skinUnlocked(ghost, 99, 99)).toBe(false)
    expect(skinUnlocked(ghost, 1, 1, ['ghost'])).toBe(true)
    expect(PETS.find((p) => p.id === 'chick')!.name).toBe('イナムル')
  })
})

describe('腕試しと限定ボス', () => {
  const base = { stats: { atk: 0, hp: 0, crit: 0, heal: 0 }, skills: [] as string[] }
  it('腕試し: お互いにスキルを使う 1 対 1。強い方が勝ちやすく、同じ強さならほぼ互角', () => {
    const strong = { ...base, stats: { atk: 10, hp: 10, crit: 5, heal: 2 } }
    expect(duelRate(strong, base)).toBeGreaterThan(0.9)
    expect(duelRate(base, strong)).toBeLessThan(0.1)
    const even = duelRate(base, base, 200)
    expect(even).toBeGreaterThan(0.3)
    expect(even).toBeLessThan(0.8)
    // 相手の鉄壁・不屈も効く (同じステータスでも、守りのスキルを持つ相手には勝ちにくい)
    const guard = { ...base, skills: ['wall', 'regen', 'guts'] }
    expect(duelRate(base, guard, 200)).toBeLessThan(even)
    const r = simulateDuel(strong, base, { name: '相手', icon: '🧑' }, 1)
    expect(r.enemy.hp).toBe(effectiveStats(base).hp)
    expect(r.turns.at(-1)!.enemyHp === 0 || r.turns.at(-1)!.hp === 0 || r.turns.length === 30).toBe(true)
  })
  it('限定ボスは今の進み具合に合わせた強さ', () => {
    const ev = EVENTS.find((x) => x.id === 'halloween')!
    expect(eventBoss(ev, 1).hp).toBe(Math.round(enemyForStage(1).hp * 1.4))
    expect(eventBoss(ev, 10).hp).toBeGreaterThan(eventBoss(ev, 5).hp)
  })
  it('どのイベントにも限定ボスと 4 部位の限定装備', () => {
    for (const ev of EVENTS) {
      expect(ev.boss.name).toBeTruthy()
      expect(Object.keys(ev.gear).sort()).toEqual(['body', 'feet', 'head', 'weapon'])
    }
    expect(['SR', 'SSR', 'UR']).toContain(eventGearRarity(0.9))
  })
})

describe('過去のボスと再戦', () => {
  it('勝つと初めて倒したときの 3 割のゴールド', () => {
    expect(rematchGold(1)).toBe(18)
    expect(rematchGold(10)).toBe(72)
    expect(REMATCH_DAILY).toBe(5)
  })
})
