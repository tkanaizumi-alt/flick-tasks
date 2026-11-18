import { describe, expect, it } from 'vitest'
import { BASE_JOBS, enemyForStage, type BattleStats } from '../shared/game'
import { TB_POTIONS, TB_GAUGE_MAX, canAct, enemyMoves, playOut, turnBattle, type TurnAction } from '../shared/turn'

const p: BattleStats = { stats: { atk: 10, hp: 10, crit: 2, heal: 2 }, skills: [], job: BASE_JOBS[1], jobLevel: 5 }
const enemy = enemyForStage(8)

describe('ターン制バトル', () => {
  it('同じ種と行動なら同じ結果 (サーバーとフロントで一致)', () => {
    const acts: TurnAction[] = ['attack', 'guard', 'attack', 'heal', 'attack']
    expect(turnBattle(p, enemy, 42, acts)).toEqual(turnBattle(p, enemy, 42, acts))
    // 途中までの結果は、続きを足しても変わらない
    const a = turnBattle(p, enemy, 42, acts.slice(0, 3))
    const b = turnBattle(p, enemy, 42, acts)
    expect(b.turns.slice(0, 3)).toEqual(a.turns)
  })
  it('敵の行動は選んだ行動に左右されない。ためた次は強攻撃', () => {
    const m = enemyMoves(7)
    expect(m[0]).toBe('attack')
    for (let i = 1; i < m.length; i++) if (m[i - 1] === 'charge') expect(m[i]).toBe('heavy')
    const x = turnBattle(p, enemy, 7, ['guard', 'guard', 'guard'])
    const y = turnBattle(p, enemy, 7, ['attack', 'attack', 'attack'])
    expect(x.turns.map((t) => t.enemyMove)).toEqual(y.turns.map((t) => t.enemyMove))
  })
  it('まもると受けるダメージが減る', () => {
    // 強攻撃のターンを探して、守ったときと攻撃したときを比べる
    const seed = [...Array(200).keys()].find((s) => enemyMoves(s)[2] === 'heavy')!
    const g = turnBattle(p, enemy, seed, ['attack', 'attack', 'guard']).turns[2]
    const a = turnBattle(p, enemy, seed, ['attack', 'attack', 'attack']).turns[2]
    expect(g.enemyMove).toBe('heavy')
    if (!g.dodged && !a.dodged) expect(g.taken).toBeLessThan(a.taken)
  })
  it('力をためているターンは攻撃してこない', () => {
    const seed = [...Array(200).keys()].find((s) => enemyMoves(s)[1] === 'charge')!
    expect(turnBattle(p, enemy, seed, ['attack', 'attack']).turns[1].taken).toBe(0)
  })
  it('必殺技はゲージ満タン、回復薬は数に限りがある', () => {
    const s0 = turnBattle(p, enemy, 1, [])
    expect(canAct(s0, 'skill')).toBeTruthy()
    expect(canAct(s0, 'heal')).toBeNull()
    expect(canAct(s0, 'nope' as TurnAction)).toBeTruthy()
    const s1 = turnBattle(p, enemy, 1, Array(TB_POTIONS).fill('heal'))
    expect(s1.potions).toBe(0)
    expect(canAct(s1, 'heal')).toBeTruthy()
    // まもり続けるとゲージがたまる
    const s2 = turnBattle(p, enemy, 1, ['guard', 'guard', 'guard', 'guard'])
    expect(s2.gauge).toBe(TB_GAUGE_MAX)
    expect(canAct(s2, 'skill')).toBeNull()
    const s3 = turnBattle(p, enemy, 1, ['guard', 'guard', 'guard', 'guard', 'skill'])
    expect(s3.turns[4].special).toBe(true)
    expect(s3.gauge).toBeLessThan(TB_GAUGE_MAX)
  })
  it('できない行動は「たたかう」として扱う', () => {
    const s = turnBattle(p, enemy, 3, ['skill'])
    expect(s.turns[0].action).toBe('attack')
  })
  it('最後まで戦うと終わる', () => {
    const s = playOut(p, enemyForStage(1), 9)
    expect(s.done).toBe(true)
    expect(s.win).toBe(true)
    expect(canAct(s, 'attack')).toBeTruthy()
  })
})
