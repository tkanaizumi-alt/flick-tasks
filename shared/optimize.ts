/**
 * おまかせ装備: 持っている装備の組み合わせを試合のシミュレーションで比べて、一番勝てるものを選ぶ。
 * 部位ごとに有望な候補 (ステータスの伸びが大きいもの・特殊効果つき) を数個に絞ってから、全部の組み合わせを試す
 */
import { SLOTS, effectiveStats, enemyForStage, winRate, type Item, type PlayerState, type Slot } from './game'

type Gear = Pick<PlayerState, 'items' | 'equipped' | 'stats' | 'skills' | 'job' | 'jobLevel' | 'bonus' | 'stage'>

/** ざっくりした強さ (攻撃 × 会心の期待値 × 体力と回復) */
const power = (p: Gear) => {
  const s = effectiveStats(p)
  return s.atk * (1 + s.crit / 100) * (s.hp + s.heal * 8)
}

/** 部位ごとの候補の数 (特殊効果つきは別に 1 つまで足す) */
const PER_SLOT = 3

export function bestGear(p: Gear, trials = 24) {
  // 今のステージのボスと、少し先のボス。今のボスにすでに勝てるときも、先で差が出る組み合わせを選べるように
  const targets = [enemyForStage(p.stage), enemyForStage(p.stage + 3)]
  const score = (equipped: Gear['equipped']) => {
    const q = { ...p, equipped }
    const rates = targets.map((e) => winRate(q, e, trials))
    return { rate: rates[0], value: rates[0] + rates[1] * 0.5 + power(q) * 1e-9 }
  }

  // 部位ごとの候補: 今の他の部位はそのままで、その装備に替えたときの強さが大きい順
  const candidates = SLOTS.map(({ key }) => {
    const list = p.items.filter((i) => i.slot === key)
    if (!list.length) return [null]
    const ranked = [...list].sort((a, b) => power({ ...p, equipped: { ...p.equipped, [key]: b.id } }) - power({ ...p, equipped: { ...p.equipped, [key]: a.id } }))
    const top = ranked.slice(0, PER_SLOT)
    const fx = ranked.find((i) => i.effect && !top.includes(i))
    return [...top, ...(fx ? [fx] : [])] as (Item | null)[]
  })

  let best = { equipped: p.equipped, ...score(p.equipped) }
  const before = best.rate
  const walk = (i: number, acc: Partial<Record<Slot, string>>) => {
    if (i === SLOTS.length) {
      const s = score(acc)
      if (s.value > best.value) best = { equipped: { ...acc }, ...s }
      return
    }
    for (const c of candidates[i]) walk(i + 1, c ? { ...acc, [SLOTS[i].key]: c.id } : acc)
  }
  walk(0, {})
  const changed = SLOTS.some(({ key }) => (best.equipped[key] ?? null) !== (p.equipped[key] ?? null))
  return { equipped: best.equipped, rate: best.rate, before, changed }
}
