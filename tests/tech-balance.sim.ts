// 職業のわざのバランス測定 (手で実行する): npx vitest run -c tests/balance.config.ts tests/tech-balance.sim.ts
// オートで勝率 50% 前後になるステージで、わざなし (前の作り) とわざあり の勝率を職業ごとに比べる
import { it } from 'vitest'
import { enemyForStage, rollItem, winRate, type BattleStats, type Item, type JobDef } from '../shared/game'
import { playOut, plainPlan } from '../shared/turn'
import { ALL_JOBS } from '../worker/jobs'

const gearFor = (stage: number) => {
  const items = (['head', 'body', 'feet', 'weapon'] as const).map((slot, i) => ({ id: `g${i}`, ...rollItem(1000 + i, stage, 'R', slot), plus: 0 }) as Item)
  return { items, equipped: Object.fromEntries(items.map((i) => [i.slot, i.id])) }
}
const build = (job: JobDef, level: number, stage: number, plan: number[]): BattleStats => {
  const sp = (level - 1) * 3
  const v = plan.map((x) => Math.floor(sp * x))
  v[0] += sp - v.reduce((a, b) => a + b, 0)
  return { stats: { atk: v[0], hp: v[1], crit: v[2], heal: v[3] }, skills: [], job, jobLevel: Math.max(1, Math.floor(level / 2)), ...gearFor(stage) }
}

it('職業ごとのわざの効き目', () => {
  const rows: string[] = []
  let all = 0
  let n = 0
  for (const job of ALL_JOBS) {
    let dOld = 0
    let dNew = 0
    let k = 0
    for (const lv of [10, 25]) {
      for (const plan of [[0.5, 0.5, 0, 0], [0.3, 0.4, 0, 0.3]]) {
        let st = 1
        while (st < 45 && winRate(build(job, lv, st, plan), enemyForStage(st), 30) >= 0.5) st++
        for (const d of [-1, 0, 1]) {
          const x = Math.max(1, st + d)
          const p = build(job, lv, x, plan)
          const old = { ...p, job: { ...job, techs: [], special: undefined } }
          const e = enemyForStage(x)
          const auto = winRate(p, e, 60)
          let wo = 0
          let wn = 0
          for (let i = 0; i < 60; i++) {
            if (playOut(old, e, 7919 * (i + 1), plainPlan).win) wo++
            if (playOut(p, e, 7919 * (i + 1)).win) wn++
          }
          dOld += wo / 60 - auto
          dNew += wn / 60 - auto
          k++
        }
      }
    }
    all += dNew / k
    n++
    rows.push(`${job.name.padEnd(6, '　')} わざなし ${Math.round((dOld / k) * 100)} → わざあり ${Math.round((dNew / k) * 100)} (オートとの差ポイント) [${(job.techs ?? []).join(',')} / ${job.special ?? '-'}]`)
  }
  console.log(rows.join('\n'))
  console.log(`わざありの平均 ${Math.round((all / n) * 100)}ポイント`)
}, 600000)
