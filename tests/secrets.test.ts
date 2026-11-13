import { describe, expect, it } from 'vitest'
import { ACHIEVEMENT_MAP } from '../shared/achievements'
import { BASE_JOBS, SKILL_MAP, SKINS, hasEffect, skinUnlocked, type BattleStats } from '../shared/game'
import { ADVANCED_JOBS, JOB_MAP, JOB_UNLOCK_LEVEL, SECRET_JOBS, lockedJobCount, newlyUnlocked, unlockedJobs } from '../worker/jobs'
import { SECRET_SKILLS, lockedSecretCount, visibleSecrets } from '../worker/secrets'

const lv = (ids: string[], level = JOB_UNLOCK_LEVEL) => Object.fromEntries(ids.map((id) => [id, level]))
const ADV = ADVANCED_JOBS.map((j) => j.id)

describe('複合職 (隠し職業)', () => {
  it('最初は基本職だけ。残りはすべて「？？？」の数に入る', () => {
    expect(unlockedJobs({}).map((j) => j.id)).toEqual(BASE_JOBS.map((j) => j.id))
    expect(lockedJobCount({})).toBe(ADVANCED_JOBS.length + SECRET_JOBS.length)
  })
  it('上位職 2 つを Lv10 にすると複合職が現れる (片方だけでは出ない)', () => {
    const one = lv(['warrior', 'mage', 'blademaster'])
    expect(unlockedJobs(one).some((j) => j.id === 'spellblade')).toBe(false)
    const both = lv(['warrior', 'mage', 'blademaster', 'archmage'])
    expect(unlockedJobs(both).some((j) => j.id === 'spellblade')).toBe(true)
    expect(newlyUnlocked(lv(['mage']), 'archmage', JOB_UNLOCK_LEVEL).map((j) => j.id)).toEqual([])
    expect(newlyUnlocked(lv(['blademaster']), 'archmage', JOB_UNLOCK_LEVEL).map((j) => j.id)).toContain('spellblade')
  })
  it('上位職のどの 2 つの組み合わせにも複合職がある (10 通り)', () => {
    const pairs = new Set(SECRET_JOBS.filter((j) => j.requires.length === 2).map((j) => j.requires.slice().sort().join('+')))
    for (let i = 0; i < ADV.length; i++) for (let k = i + 1; k < ADV.length; k++) expect(pairs.has([ADV[i], ADV[k]].sort().join('+'))).toBe(true)
    expect(pairs.size).toBe(10)
  })
  it('勇者は上位職 5 つすべてが条件', () => {
    expect(unlockedJobs(lv(ADV.slice(0, 4))).some((j) => j.id === 'hero')).toBe(false)
    expect(unlockedJobs(lv(ADV)).some((j) => j.id === 'hero')).toBe(true)
  })
  it('複合職の条件はすべて上位職で、組み合わせは重ならない', () => {
    const keys = SECRET_JOBS.map((j) => j.requires.slice().sort().join('+'))
    expect(new Set(keys).size).toBe(keys.length)
    for (const j of SECRET_JOBS) {
      expect(j.tier).toBe(3)
      expect(j.requires.every((r) => JOB_MAP[r]?.tier === 2)).toBe(true)
      expect(j.effects?.length).toBeGreaterThan(0)
    }
  })
  it('複合職の戦闘効果は装備やスキルと同じように効く', () => {
    const p: BattleStats = { stats: { atk: 0, hp: 0, crit: 0, heal: 0 }, skills: [], job: JOB_MAP.spellblade }
    expect(hasEffect(p, 'first')).toBe(true)
    expect(hasEffect({ ...p, job: JOB_MAP.blademaster }, 'first')).toBe(false)
  })
})

describe('隠しスキル', () => {
  it('条件はすべて実在するスキルで、組み合わせは重ならない', () => {
    const keys = SECRET_SKILLS.map((s) => s.requires.slice().sort().join('+'))
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of SECRET_SKILLS) expect(s.requires.every((r) => SKILL_MAP[r])).toBe(true)
  })
  it('見つかった分だけ「？？？」の数が減る', () => {
    expect(lockedSecretCount([])).toBe(SECRET_SKILLS.length)
    expect(visibleSecrets(['double', 'wall']).map((s) => s.id)).toEqual(['x_ironfist'])
    expect(lockedSecretCount(['double', 'wall'])).toBe(SECRET_SKILLS.length - 1)
  })
})

describe('隠しスキン', () => {
  const secret = SKINS.filter((s) => s.secret)
  it('どれも隠し実績で解放される', () => {
    expect(secret.length).toBeGreaterThan(0)
    for (const s of secret) expect(ACHIEVEMENT_MAP[s.secret!]?.hidden).toBe(true)
  })
  it('その実績を取るまでは選べない', () => {
    const s = secret[0]
    expect(skinUnlocked(s, 99, 99)).toBe(false)
    expect(skinUnlocked(s, 1, 1, [], [s.secret!])).toBe(true)
  })
})
