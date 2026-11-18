// ステージ 31〜100 の難しさの測定 (手で実行する): npx vitest run -c tests/balance.config.ts tests/stage-curve.sim.ts
// レベル・装備のレア度ごとに、オートで勝率 50% 以上で勝てる一番先のステージ
import { it } from 'vitest'
import { enemyForStage, levelInfo, rollItem, winRate, type BattleStats, type Item, type Rarity } from '../shared/game'
import { statsAt } from '../shared/extras'
import { JOB_MAP } from '../worker/jobs'

const gear = (stage: number, rarity: Rarity, plus: number) => {
  const items = (['head', 'body', 'feet', 'weapon'] as const).map((slot, i) => {
    const it = rollItem(2000 + i, stage, rarity, slot)
    return { id: `g${i}`, ...it, ...statsAt(it, plus), plus } as Item
  })
  return { items, equipped: Object.fromEntries(items.map((i) => [i.slot, i.id])) }
}
const build = (job: string, level: number, stage: number, rarity: Rarity, plus: number): BattleStats => {
  const sp = (level - 1) * 3
  return { stats: { atk: Math.floor(sp * 0.5), hp: Math.floor(sp * 0.3), crit: Math.floor(sp * 0.2), heal: 0 }, skills: ['double', 'smash', 'critup', 'wall'], job: JOB_MAP[job], jobLevel: Math.min(30, level), ...gear(stage, rarity, plus) }
}
it('どこまで進めるか', () => {
  const rows: string[] = []
  for (const [lv, rarity, plus] of [[30, 'SR', 3], [40, 'SSR', 0], [40, 'SSR', 5], [55, 'SSR', 5], [70, 'UR', 3], [90, 'UR', 10]] as [number, Rarity, number][]) {
    for (const job of ['assassin', 'blademaster', 'samurai']) {
      let st = 1
      while (st < 140 && winRate(build(job, lv, st, rarity, plus), enemyForStage(st), 30) >= 0.5) st++
      rows.push(`Lv${lv} ${rarity}+${plus} ${job}: ステージ${st - 1}まで (${enemyForStage(st).name} HP${enemyForStage(st).hp} 攻撃${enemyForStage(st).atk})`)
    }
  }
  console.log(rows.join('\n'))
  console.log('XP 10629 =', levelInfo(10629).level)
}, 600000)
