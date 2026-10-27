import { describe, expect, it } from 'vitest'
import {
  DAILY_PICKS,
  WEIGHT_XP,
  baseXp,
  childXp,
  computeXp,
  dailyMissions,
  helpXp,
  jstDayStart,
  missionProgress,
  rollItem,
  simulateBattle,
  enemyForStage,
  weightChoices,
  type DailyCounts,
  type PlayerState,
} from '../shared/game'
import { bestStreakOf, streakOf } from '../shared/achievements'
import { isRule, ruleLabel, ruleMatches } from '../shared/recurring'
import { mentionsIn, san, tagsOf } from '../shared/types'

const now = Date.UTC(2026, 9, 27, 3, 0) // JST 12:00
const xp = (over: Partial<Parameters<typeof computeXp>[0]> = {}) =>
  computeXp({ weight: 'M', createdAt: now - 3600_000, now, doneToday: 1, doneYesterday: false, source: 'user', skills: [], ...over })

describe('経験値', () => {
  it('大きさごとの基本 XP', () => {
    expect(WEIGHT_XP).toEqual({ S: 10, M: 20, L: 40, XL: 80 })
    expect(xp({ weight: 'S' }).amount).toBe(10)
    expect(xp({ weight: 'XL' }).amount).toBe(80)
    expect(xp({ weight: null }).amount).toBe(20) // 判定前は中
  })
  it('その日の最初の完了は +5、作ってすぐの完了は ×0.25', () => {
    expect(xp({ doneToday: 0 }).amount).toBe(25)
    expect(xp({ createdAt: now - 30_000 }).amount).toBe(5)
  })
  it('分解: 子タスクで元タスクの XP を分け合い、元タスクは 0', () => {
    expect(childXp('L', 4)).toBe(10)
    expect(childXp(null, 3)).toBe(7) // 中 20 / 3
    expect(childXp('S', 7)).toBe(2) // 最低 2
    expect(xp({ base: 0 }).amount).toBe(0)
    expect(baseXp({ weight: 'L', children: { total: 3 } })).toBe(0)
    expect(baseXp({ weight: 'S', parent: { weight: 'L', siblings: 4 } })).toBe(10)
  })
  it('手伝いボーナス: 進行中 +3、完了は持ち主の半分 (最低 1)', () => {
    expect(helpXp('doing', 40)).toBe(3)
    expect(helpXp('done', 15)).toBe(8)
    expect(helpXp('done', 0)).toBe(1)
  })
})

describe('大きさの調整', () => {
  it('AI の判定から 1 段階まで。特大は AI が特大のときだけ', () => {
    expect(weightChoices('M')).toEqual(['S', 'M', 'L'])
    expect(weightChoices('S')).toEqual(['S', 'M'])
    expect(weightChoices('L')).toEqual(['M', 'L'])
    expect(weightChoices('XL')).toEqual(['L', 'XL'])
    expect(weightChoices(null)).toEqual([])
  })
})

describe('デイリーミッション', () => {
  it('毎日 基本 + 日替わり + ボーナス の数が出て、同じ日は全員同じ', () => {
    const day = jstDayStart(now)
    const a = dailyMissions(day)
    expect(a).toHaveLength(DAILY_PICKS + 2)
    expect(a[0].id).toBe('done3')
    expect(a.at(-1)!.id).toBe('all')
    expect(dailyMissions(day).map((m) => m.id)).toEqual(a.map((m) => m.id))
    expect(new Set(a.map((m) => m.id)).size).toBe(a.length)
  })
  it('進み具合', () => {
    const c: DailyCounts = { done: 2, big: 0, midPlus: 0, early: 1, battles: 0, adds: 0, doings: 0, chests: 0, ontime: 1, split: 2 }
    const m = dailyMissions(jstDayStart(now))[0]
    expect(missionProgress(m, c, [])).toEqual({ value: 2, done: false, claimed: false })
    expect(missionProgress({ id: 'split2', label: '', goal: 2, gold: 0 }, c, []).done).toBe(true)
    expect(missionProgress({ id: 'ontime', label: '', goal: 1, gold: 0 }, c, ['ontime']).claimed).toBe(true)
  })
})

describe('装備', () => {
  it('部位・レア度ごとに 4 種類の名前が出る', () => {
    const names = new Map<string, Set<string>>()
    for (let i = 1; i < 30000; i++) {
      const it = rollItem((i * 2654435761) >>> 0, 3)
      const k = `${it.slot}/${it.rarity}`
      names.set(k, (names.get(k) ?? new Set()).add(it.name))
    }
    expect(names.size).toBe(20) // 4 部位 × 5 レア度 (N・R・SR・SSR・UR)
    for (const set of names.values()) expect(set.size).toBe(4)
  })
  it('同じ種なら同じ装備・同じ戦闘結果 (再現できる)', () => {
    expect(rollItem(42, 5)).toEqual(rollItem(42, 5))
    const p = { stats: { atk: 5, hp: 5, crit: 2, heal: 1 }, skills: [], items: [], equipped: {}, job: { id: 'warrior' }, jobLevel: 1, bonus: undefined } as unknown as PlayerState
    expect(simulateBattle(p, enemyForStage(1), 7).win).toBe(simulateBattle(p, enemyForStage(1), 7).win)
  })
})

describe('連続日数', () => {
  it('今日まだでも昨日まで続いていれば途切れない', () => {
    expect(streakOf([10, 11, 12], 12)).toBe(3)
    expect(streakOf([10, 11, 12], 13)).toBe(3)
    expect(streakOf([10, 11, 12], 14)).toBe(0)
    expect(bestStreakOf([1, 2, 3, 7, 8, 9, 10, 20])).toBe(4)
  })
})

describe('繰り返しタスク', () => {
  it('ルールの判定', () => {
    expect(isRule('weekly:1')).toBe(true)
    expect(isRule('weekly:7')).toBe(false)
    expect(isRule('monthly:0')).toBe(false)
    expect(ruleLabel('weekly:1')).toBe('毎週月曜')
    expect(ruleMatches('weekdays', '2026-10-24')).toBe(false) // 土曜
    expect(ruleMatches('weekdays', '2026-10-26')).toBe(true) // 月曜
    expect(ruleMatches('monthly:31', '2026-11-30')).toBe(true) // 31 日がない月は月末
    expect(ruleMatches('monthly:31', '2026-11-29')).toBe(false)
  })
})

describe('タグ・名前', () => {
  it('#タグ を取り出す (全角＃も)', () => {
    expect(tagsOf({ title: '見積書 #A社 #急ぎ', note: '＃社内 #A社' })).toEqual(['A社', '急ぎ', '社内'])
    expect(tagsOf({ title: 'タグなし' })).toEqual([])
  })
  it('さん を重ねない', () => {
    expect(san('ともや')).toBe('ともやさん')
    expect(san('よしおさん')).toBe('よしおさん')
  })
})

describe('@名前', () => {
  it('空白を含む名前・全角の＠も拾う', () => {
    const people = [
      { id: 'a', name: 'tomoya kanaizumi' },
      { id: 'b', name: 'よしお' },
      { id: 'c', name: 'ともや☆' },
    ]
    expect(mentionsIn('@tomoya kanaizumi 確認お願いします ＠よしお', people)).toEqual(['a', 'b'])
    expect(mentionsIn('メールアドレス a@example.com', people)).toEqual([])
  })
})
