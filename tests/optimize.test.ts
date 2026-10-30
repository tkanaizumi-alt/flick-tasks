import { describe, expect, it } from 'vitest'
import { bestGear } from '../shared/optimize'
import { BASE_JOBS, rollItem, type Item } from '../shared/game'

const base = { stats: { atk: 3, hp: 3, crit: 0, heal: 0 }, skills: [] as string[], job: BASE_JOBS[0], jobLevel: 3, bonus: undefined, stage: 6 }

describe('おまかせ装備', () => {
  it('明らかに強い装備に替える。今より勝率は下がらない', () => {
    const weak: Item = { id: 'w', slot: 'weapon', name: '木の棒', icon: 'weapon', rarity: 'N', atk: 1, hp: 0, crit: 0, heal: 0, effect: null, plus: 0 }
    const strong: Item = { id: 's', slot: 'weapon', name: '名剣', icon: 'weapon', rarity: 'SR', atk: 30, hp: 0, crit: 5, heal: 0, effect: null, plus: 0 }
    const r = bestGear({ ...base, items: [weak, strong], equipped: { weapon: 'w' } })
    expect(r.changed).toBe(true)
    expect(r.equipped.weapon).toBe('s')
    expect(r.rate).toBeGreaterThanOrEqual(r.before)
  })
  it('空いている部位にはつける。今が一番ならそのまま', () => {
    const head: Item = { id: 'h', slot: 'head', name: '帽子', icon: 'head', rarity: 'N', atk: 0, hp: 10, crit: 1, heal: 0, effect: null, plus: 0 }
    const r = bestGear({ ...base, items: [head], equipped: {} })
    expect(r.equipped.head).toBe('h')
    const again = bestGear({ ...base, items: [head], equipped: { head: 'h' } })
    expect(again.changed).toBe(false)
  })
  it('持ち物がいっぱい (70 個) でもすぐ終わる', () => {
    const items = Array.from({ length: 70 }, (_, i) => ({ id: `i${i}`, ...rollItem(500 + i, 8), plus: i % 4 }) as Item)
    const t0 = performance.now()
    const r = bestGear({ ...base, items, equipped: {} })
    const ms = performance.now() - t0
    expect(r.rate).toBeGreaterThanOrEqual(r.before)
    expect(ms).toBeLessThan(2000)
    console.log(`70 個から選ぶのに ${Math.round(ms)}ms、勝率 ${Math.round(r.before * 100)}% → ${Math.round(r.rate * 100)}%`)
  })
})
