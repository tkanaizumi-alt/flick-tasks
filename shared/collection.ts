/** 図鑑: 手に入れた装備・倒したボス・解放したスキン。うめた割合でご褒美 */
import { GEAR_NAMES, MAIN_STAGES, OPEN_STAGES, RARITY_ORDER, SKINS, enemyForStage, skinUnlocked, type Rarity, type Slot } from './game'
import { EVENTS } from './extras'

export interface CodexEntry {
  id: string
  name: string
  icon: string
  got: boolean
  /** 装備のレア度 (いちばん低いもの) */
  rarity?: Rarity
  slot?: Slot
}
export interface CodexSection {
  key: 'gear' | 'boss' | 'secret' | 'skin' | 'event'
  label: string
  entries: CodexEntry[]
  /** 割合に数えるか (季節イベントの限定装備は数えない) */
  counted: boolean
}

/** 通常の装備の名前 (同じ名前は 1 つ)。レア度の低い順 */
export const CODEX_GEAR: { name: string; slot: Slot; rarity: Rarity }[] = (() => {
  const seen = new Map<string, { name: string; slot: Slot; rarity: Rarity }>()
  for (const r of [...RARITY_ORDER].reverse()) {
    for (const slot of Object.keys(GEAR_NAMES) as Slot[]) {
      for (const name of GEAR_NAMES[slot][r]) if (!seen.has(name)) seen.set(name, { name, slot, rarity: r })
    }
  }
  return [...seen.values()]
})()
/** 季節イベントの限定装備の名前 */
export const CODEX_EVENT_GEAR = EVENTS.flatMap((e) => (Object.keys(e.gear) as Slot[]).map((slot) => ({ name: e.gear[slot], slot, event: e })))

/** うめた割合ごとのご褒美 (ゴールド) */
export const CODEX_REWARDS = [
  { pct: 25, gold: 200 },
  { pct: 50, gold: 400 },
  { pct: 75, gold: 800 },
  { pct: 100, gold: 1500 },
]

export interface CodexInput {
  /** 一度でも手に入れた装備の名前 */
  names: string[]
  stage: number
  level: number
  ownedSkins: string[]
  achieved: string[]
}

export function codexOf(x: CodexInput) {
  const names = new Set(x.names)
  const sections: CodexSection[] = [
    {
      key: 'gear',
      label: '装備',
      counted: true,
      entries: CODEX_GEAR.map((g) => ({ id: `g:${g.name}`, name: g.name, icon: g.slot, got: names.has(g.name), rarity: g.rarity, slot: g.slot })),
    },
    {
      key: 'boss',
      label: 'ボス',
      counted: true,
      entries: Array.from({ length: OPEN_STAGES }, (_, i) => {
        const e = enemyForStage(i + 1)
        return { id: `b:${i + 1}`, name: e.name, icon: e.icon, got: x.stage > i + 1 }
      }),
    },
    // シークレットのボス: 倒したものだけ載る (数には入らない)
    {
      key: 'secret',
      label: 'シークレットボス',
      counted: false,
      entries: Array.from({ length: Math.max(0, Math.min(x.stage - 1, MAIN_STAGES) - OPEN_STAGES) }, (_, i) => {
        const e = enemyForStage(OPEN_STAGES + i + 1)
        return { id: `b:${e.stage}`, name: e.name, icon: e.icon, got: true }
      }),
    },
    {
      key: 'skin',
      label: 'スキン',
      counted: true,
      entries: SKINS.map((s) => ({ id: `s:${s.id}`, name: s.name, icon: s.emoji, got: skinUnlocked(s, x.level, x.stage, x.ownedSkins, x.achieved) })),
    },
    {
      key: 'event',
      label: '季節の限定装備',
      counted: false,
      entries: CODEX_EVENT_GEAR.map((g) => ({ id: `e:${g.name}`, name: g.name, icon: g.slot, got: names.has(g.name), slot: g.slot })),
    },
  ]
  const counted = sections.filter((s) => s.counted).flatMap((s) => s.entries)
  const got = counted.filter((e) => e.got).length
  const total = counted.length
  // 100% はすべてうめたときだけ (切り上げで 100% にならないように切り捨て)
  const pct = total ? Math.floor((got / total) * 100) : 0
  return { sections, got, total, pct }
}

/** 受け取れるご褒美 (claimed = 受け取り済みの数) */
export const codexClaimable = (pct: number, claimed: number) => CODEX_REWARDS.filter((r, i) => i >= claimed && pct >= r.pct)
