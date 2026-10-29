// 職業バランスの測定 (手で実行する): npm run sim:jobs
// Lv ごとに、職業ごとに一番合う SP の振り方で「勝率 50% で勝てる一番先のステージ」と、腕試しの勝率を出す
import { it } from 'vitest'
import { BASE_JOBS, duelRate, enemyForStage, rollItem, winRate, type BattleStats, type Item, type JobDef } from '../shared/game'
import { ADVANCED_JOBS } from '../worker/jobs'

/** SP の振り方 (攻撃・体力・会心・回復の割合) */
const PLANS: Record<string, [number, number, number, number]> = {
  攻撃: [1, 0, 0, 0],
  攻体: [0.5, 0.5, 0, 0],
  攻会: [0.6, 0.2, 0.2, 0],
  体回: [0.3, 0.4, 0, 0.3],
  均等: [0.25, 0.25, 0.25, 0.25],
  体力: [0.2, 0.8, 0, 0],
}
const alloc = (sp: number, p: [number, number, number, number]) => {
  const v = p.map((x) => Math.floor(sp * x))
  v[0] += sp - v.reduce((a, b) => a + b, 0)
  return { atk: v[0], hp: v[1], crit: v[2], heal: v[3] }
}
/** そのステージ相当の R 装備 4 部位 (決まった乱数) */
const gearFor = (stage: number) => {
  const items = (['head', 'body', 'feet', 'weapon'] as const).map((slot, i) => ({ id: `g${i}`, ...rollItem(1000 + i, stage, 'R', slot), plus: 0 }) as Item)
  return { items, equipped: Object.fromEntries(items.map((i) => [i.slot, i.id])) }
}
const build = (job: JobDef, level: number, plan: keyof typeof PLANS, stage: number): BattleStats => ({
  stats: alloc((level - 1) * 3, PLANS[plan]),
  skills: [],
  job,
  jobLevel: Math.min(30, Math.max(1, Math.floor(level / 2))),
  ...gearFor(stage),
})
/** 勝率 50% 以上で勝てる一番先のステージ (その職業に一番合う振り方で) */
const reach = (job: JobDef, level: number, only?: keyof typeof PLANS) => {
  let best = 0
  let bestPlan = ''
  for (const plan of (only ? [only] : Object.keys(PLANS)) as (keyof typeof PLANS)[]) {
    let s = 1
    while (s < 60 && winRate(build(job, level, plan, s), enemyForStage(s), 40) >= 0.5) s++
    if (s - 1 > best) {
      best = s - 1
      bestPlan = plan
    }
  }
  return { best, plan: bestPlan }
}

it('職業ごとの強さ', () => {
  const jobs = [...BASE_JOBS, ...ADVANCED_JOBS]
  const levels = [5, 10, 15, 20, 30]
  console.log('\n■ 勝てるステージ (Lv ごと、一番合う振り方)')
  console.log('職業'.padEnd(8) + levels.map((l) => `Lv${l}`.padStart(12)).join(''))
  for (const j of jobs) {
    console.log(j.name.padEnd(8, '　') + levels.map((l) => {
      const r = reach(j, l)
      return `${r.best}(${r.plan})`.padStart(12)
    }).join(''))
  }
  console.log('\n■ 勝てるステージ (攻撃と体力に半分ずつ振ったとき)')
  for (const j of jobs) console.log(j.name.padEnd(8, '　') + levels.map((l) => String(reach(j, l, '攻体').best).padStart(12)).join(''))
  console.log('\n■ 腕試し (Lv15、それぞれ一番合う振り方、行の職業が勝つ割合 %)')
  const base = BASE_JOBS
  const at = (j: JobDef) => build(j, 15, reach(j, 15).plan as keyof typeof PLANS, 8)
  console.log('        ' + base.map((b) => b.name.padStart(6, '　')).join(''))
  for (const a of base) console.log(a.name.padEnd(6, '　') + base.map((b) => String(Math.round(duelRate(at(a), at(b), 60) * 100)).padStart(7)).join(''))
}, 600_000)
