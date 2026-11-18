// ターン制バトルのバランス測定 (手で実行する): npx vitest run -c tests/balance.config.ts tests/turn-balance.sim.ts
// オートで勝率 50% 前後になるステージで、ターン制 (目安の作戦) の勝率と比べる
import { it } from 'vitest'
import { BASE_JOBS, enemyForStage, rollItem, winRate, type BattleStats, type Item } from '../shared/game'
import { playOut } from '../shared/turn'

const gearFor = (stage: number) => {
  const items = (['head', 'body', 'feet', 'weapon'] as const).map((slot, i) => ({ id: `g${i}`, ...rollItem(1000 + i, stage, 'R', slot), plus: 0 }) as Item)
  return { items, equipped: Object.fromEntries(items.map((i) => [i.slot, i.id])) }
}
const build = (job: number, level: number, stage: number, plan: number[]): BattleStats => {
  const sp = (level - 1) * 3
  const v = plan.map((x) => Math.floor(sp * x))
  v[0] += sp - v.reduce((a, b) => a + b, 0)
  return { stats: { atk: v[0], hp: v[1], crit: v[2], heal: v[3] }, skills: [], job: BASE_JOBS[job], jobLevel: Math.max(1, Math.floor(level / 2)), ...gearFor(stage) }
}

it('オートとターン制の勝率', () => {
  const rows: string[] = []
  let sum = 0
  for (const lv of [5, 10, 20, 30]) {
    for (const j of [0, 1, 3, 4]) {
      for (const plan of [[0.5, 0.5, 0, 0], [1, 0, 0, 0], [0.3, 0.4, 0, 0.3]]) {
        let st = 1
        while (st < 40 && winRate(build(j, lv, st, plan), enemyForStage(st), 40) >= 0.5) st++
        for (const d of [-1, 0, 1]) {
          const x = Math.max(1, st + d)
          const p = build(j, lv, x, plan)
          const e = enemyForStage(x)
          const auto = winRate(p, e, 80)
          let w = 0
          for (let i = 0; i < 80; i++) if (playOut(p, e, 7919 * (i + 1)).win) w++
          const turn = w / 80
          sum += turn - auto
          rows.push(`Lv${lv} ${BASE_JOBS[j].name} ${plan.join('/')} st${x}: オート ${Math.round(auto * 100)}% ターン制 ${Math.round(turn * 100)}%`)
        }
      }
    }
  }
  console.log(rows.join('\n'))
  console.log(`平均の差 ${Math.round((sum / rows.length) * 100)}ポイント`)
})
