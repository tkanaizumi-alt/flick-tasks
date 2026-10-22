// 隠しスキル (裏データ)。「知恵」のスキル × 攻撃/守護のスキルの両方を習得すると現れ、SP で覚えられる。
// フロントには解放済みのものの名前・説明と、効果の数値 (Bonus) だけを送る
import { NO_BONUS, SKILL_MAP, type Bonus, type SecretSkillView } from '../shared/game'

interface SecretSkill {
  id: string
  name: string
  desc: string
  cost: number
  requires: [string, string] // [知恵のスキル, 攻撃/守護のスキル]
  bonus: Partial<Bonus>
}

export const SECRET_SKILLS: SecretSkill[] = [
  { id: 'x_hyperfocus', name: '超集中', desc: '会心率+15%・攻撃+10%', cost: 5, requires: ['focus', 'barrier'], bonus: { crit: 15, atk: 1.1 } },
  { id: 'x_tenacity', name: '執念', desc: '体力+20%・毎ターン回復+5', cost: 5, requires: ['streak', 'guts'], bonus: { hp: 1.2, heal: 5 } },
  { id: 'x_swift', name: '早業', desc: '1ターン目の攻撃×2・攻撃+5%', cost: 3, requires: ['early', 'double'], bonus: { effects: ['first'], atk: 1.05 } },
  { id: 'x_alchemy', name: '錬金剣', desc: '攻撃+15%・タスクのゴールド+20%', cost: 4, requires: ['goldsmith', 'smash'], bonus: { atk: 1.15, gold: 0.2 } },
  { id: 'x_wisdomshield', name: '叡智の盾', desc: '受けるダメージ-15%・タスクのXP+10%', cost: 5, requires: ['scholar', 'wall'], bonus: { guard: 0.85, xp: 0.1 } },
  { id: 'x_analysis', name: '解析', desc: '会心ダメージ+50%・会心率+5%', cost: 4, requires: ['ai', 'critup'], bonus: { critDmg: 0.5, crit: 5 } },
  { id: 'x_sanctuary', name: '聖域', desc: '毎ターン回復+8・与ダメージの10%を吸収', cost: 4, requires: ['focus', 'regen'], bonus: { heal: 8, effects: ['lifesteal'] } },
  { id: 'x_enlighten', name: '悟り', desc: '攻撃+25%・会心率+10%', cost: 6, requires: ['scholar', 'finisher'], bonus: { atk: 1.25, crit: 10 } },
]
export const SECRET_MAP: Record<string, SecretSkill> = Object.fromEntries(SECRET_SKILLS.map((s) => [s.id, s]))

/** 習得済みの通常スキルから見えるようになった隠しスキル */
export function visibleSecrets(owned: string[]): SecretSkillView[] {
  return SECRET_SKILLS.filter((s) => s.requires.every((r) => owned.includes(r))).map((s) => ({
    id: s.id,
    name: s.name,
    desc: s.desc,
    cost: s.cost,
    combo: s.requires.map((r) => SKILL_MAP[r]?.name ?? r).join(' × '),
    owned: owned.includes(s.id),
  }))
}

/** 習得済みの隠しスキルの効果を合算 (倍率は掛け算、それ以外は足し算) */
export function bonusOf(owned: string[]): Bonus {
  const b: Bonus = { ...NO_BONUS, effects: [] }
  for (const id of owned) {
    const s = SECRET_MAP[id]
    if (!s) continue
    const x = s.bonus
    b.atk *= x.atk ?? 1
    b.hp *= x.hp ?? 1
    b.guard *= x.guard ?? 1
    b.crit += x.crit ?? 0
    b.critDmg += x.critDmg ?? 0
    b.heal += x.heal ?? 0
    b.xp += x.xp ?? 0
    b.gold += x.gold ?? 0
    b.effects.push(...(x.effects ?? []))
  }
  return b
}
