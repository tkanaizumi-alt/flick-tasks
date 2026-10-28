/** レイドボス・ペット・ショップ・季節イベント・負けたときのアドバイス */
import { MAX_TURNS, bossGold, enemyForStage, type BattleResult, type Enemy, type Item, type Rarity, type Slot } from './game'
import type { AchievementStats } from './achievements'

const DAY = 86400000
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
/** その日を含む週の月曜 (YYYY-MM-DD) */
export const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
export const shiftDay = addDays

// ---------- 週替わりのレイドボス (全員の今週の XP がダメージになる) ----------
const RAIDS = [
  { name: '締切の魔王', icon: '😈' },
  { name: '会議の巨人', icon: '🗿' },
  { name: '書類の大蛇', icon: '🐍' },
  { name: 'メールの竜', icon: '🐲' },
  { name: '残業の亡霊', icon: '👻' },
  { name: '散らかりゴーレム', icon: '🪨' },
  { name: '先延ばしの怪鳥', icon: '🦤' },
  { name: '属人化クラーケン', icon: '🦑' },
]
/** 1 人あたりの HP (1 週間で 1 人 15〜20 件ほど完了すれば倒せる) */
export const RAID_HP_PER_PLAYER = 250
export const RAID_GOLD = 150

export function raidForWeek(monday: string, players: number) {
  const n = Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * DAY))
  const b = RAIDS[((n % RAIDS.length) + RAIDS.length) % RAIDS.length]
  return { ...b, hp: Math.max(1, players) * RAID_HP_PER_PLAYER }
}

// ---------- ペット (実績の数や働き方で仲間になる。連れているとXP・ゴールドに少しボーナス) ----------
export interface PetDef {
  id: string
  name: string
  emoji: string
  /** 仲間になる条件: 実績の数、または活動の記録 (大以上の完了・朝の完了・連続日数・手伝い・ステージ・特大) */
  need: { stat: keyof AchievementStats | 'achievements'; goal: number; label: string }
  xp: number // タスク XP (加算倍率)
  gold: number // タスクのゴールド (加算倍率)
}
const ach = (goal: number) => ({ stat: 'achievements' as const, goal, label: `実績${goal}個` })
export const PETS: PetDef[] = [
  { id: 'chick', name: 'イナムル', emoji: '🐣', need: ach(1), xp: 0.03, gold: 0 },
  { id: 'kitten', name: 'クロエ', emoji: '🐈', need: ach(3), xp: 0, gold: 0.1 },
  { id: 'puppy', name: 'マックス', emoji: '🐕', need: ach(5), xp: 0.05, gold: 0 },
  { id: 'owlet', name: 'オリバー', emoji: '🦉', need: ach(8), xp: 0.05, gold: 0.05 },
  { id: 'drake', name: 'アーサー', emoji: '🐲', need: ach(12), xp: 0.08, gold: 0.05 },
  { id: 'bird', name: 'ルーシー', emoji: '🐦', need: ach(16), xp: 0.1, gold: 0.1 },
  // 実績の数ではなく、働き方で仲間になる
  { id: 'andre', name: 'アンドレ', emoji: '🦁', need: { stat: 'big', goal: 10, label: '「大」以上を10件完了' }, xp: 0.06, gold: 0 },
  { id: 'mike', name: 'マイク', emoji: '🐒', need: { stat: 'early', goal: 10, label: '朝10時までに10件完了' }, xp: 0, gold: 0.08 },
  { id: 'george', name: 'ジョージ', emoji: '🐢', need: { stat: 'bestStreak', goal: 7, label: '7日連続で完了' }, xp: 0.05, gold: 0.05 },
  { id: 'emily', name: 'エミリー', emoji: '🦩', need: { stat: 'helps', goal: 10, label: '他の人のタスクを10回進める' }, xp: 0, gold: 0.1 },
  { id: 'lucas', name: 'ルーカス', emoji: '🐺', need: { stat: 'cleared', goal: 15, label: 'ステージ15をクリア' }, xp: 0.08, gold: 0 },
  { id: 'sophia', name: 'ソフィア', emoji: '🦋', need: { stat: 'xl', goal: 1, label: '「特大」を1件完了' }, xp: 0.05, gold: 0.05 },
]
export const PET_MAP: Record<string, PetDef> = Object.fromEntries(PETS.map((p) => [p.id, p]))
/** ペットが仲間になっているか (achievements = 取った実績の数) */
export const petUnlocked = (p: PetDef, achievements: number, stats: AchievementStats | null) =>
  p.need.stat === 'achievements' ? achievements >= p.need.goal : (stats?.[p.need.stat] ?? 0) >= p.need.goal
/** 条件の進み具合 (表示用) */
export const petProgress = (p: PetDef, achievements: number, stats: AchievementStats | null) =>
  Math.min(p.need.goal, p.need.stat === 'achievements' ? achievements : (stats?.[p.need.stat] ?? 0))
export const petEffect = (p: PetDef) => [p.xp && `XP+${Math.round(p.xp * 100)}%`, p.gold && `ゴールド+${Math.round(p.gold * 100)}%`].filter(Boolean).join('・')

// ---------- ショップ ----------
export const SHOP = [
  { id: 'boost', name: 'XP2倍チケット', desc: '次の3回の完了でXPが2倍', icon: '🎫', price: 200 },
  { id: 'srchest', name: 'SR以上確定の宝箱', desc: 'SR 78% ・ SSR 20% ・ UR 2%', icon: '💎', price: 400 },
  { id: 'bag', name: '持ち物の枠 +10', desc: '持てる装備が10個増える', icon: '🎒', price: 300 },
  { id: 'treat', name: 'みんなに差し入れ', desc: 'ほかのメンバー全員に💰30（1日1回）', icon: '🍩', price: 300 },
] as const
export type ShopId = (typeof SHOP)[number]['id']
export const BOOST_COUNT = 3
export const srChestRarity = (r: number): Rarity => (r < 0.02 ? 'UR' : r < 0.22 ? 'SSR' : 'SR')
/** 持ち物の枠: 1 回 +10、3 回 (+30) まで。値段は 300 → 600 → 900 */
export const BAG_STEP = 10
export const BAG_MAX_BUYS = 3
export const bagPrice = (extra: number) => 300 * (Math.floor(extra / BAG_STEP) + 1)
/** 差し入れで 1 人が受け取るゴールド */
export const TREAT_GOLD = 30
/** ショップの値段 (持ち物の枠は買った回数で上がる) */
export const shopPrice = (id: ShopId, invExtra = 0) => (id === 'bag' ? bagPrice(invExtra) : SHOP.find((s) => s.id === id)!.price)

/** ゴールドで強化 (素材の装備なし)。レア度ごとの値段 × 次の段階 */
const ENHANCE_GOLD: Record<Rarity, number> = { N: 30, R: 60, SR: 120, SSR: 250, UR: 500 }
export const enhanceGold = (rarity: Rarity, plus: number) => ENHANCE_GOLD[rarity] * (plus + 1)

// ---------- 装備の強化 (素材の装備を 1 つ使って +1。最大 +10) ----------
export const PLUS_MAX = 10
/** 強化 1 回で各ステータス +10% (最低 +1) */
export const plusUp = (v: number) => (v > 0 ? v + Math.max(1, Math.round(v * 0.1)) : 0)

const RARITY_UP: Rarity[] = ['N', 'R', 'SR', 'SSR', 'UR']
/** 1 つ下 / 上のレア度 (無ければ null) */
export const lowerRarity = (r: Rarity): Rarity | null => RARITY_UP[RARITY_UP.indexOf(r) - 1] ?? null
export const higherRarity = (r: Rarity): Rarity | null => RARITY_UP[RARITY_UP.indexOf(r) + 1] ?? null

/**
 * 強化の素材に使える装備 (使う順)。同じ部位で、同じレア度の装備か、
 * 1 つ下のレア度で +10 まで強化した装備。装備中のものと強化する装備そのものは使わない。
 * 同じレア度 (強化の低いものから) → 1 つ下のレア度の +10 の順
 */
export function materialsFor<T extends Pick<Item, 'id' | 'slot' | 'rarity' | 'plus'>>(item: T, items: T[], equippedIds: string[]): T[] {
  const lower = lowerRarity(item.rarity)
  return items
    .filter((i) => i.id !== item.id && i.slot === item.slot && !equippedIds.includes(i.id))
    .filter((i) => i.rarity === item.rarity || (i.rarity === lower && (i.plus ?? 0) >= PLUS_MAX))
    .sort((a, b) => Number(a.rarity !== item.rarity) - Number(b.rarity !== item.rarity) || (a.plus ?? 0) - (b.plus ?? 0))
}

// ---------- 季節イベント (期間中は XP+10%、10 件完了で限定スキン) ----------
export interface EventDef {
  id: string
  name: string
  icon: string
  from: string // MM-DD
  to: string // MM-DD (両端を含む)
  skin: { id: string; name: string; emoji: string; bg: string }
  /** 期間中だけ出る限定ボスと、倒すと手に入る限定装備の名前 (部位ごと) */
  boss: { name: string; icon: string }
  gear: Record<Slot, string>
}
export const EVENT_GOAL = 10
export const EVENT_XP = 0.1
export const EVENTS: EventDef[] = [
  {
    id: 'newyear', name: 'お正月', icon: '🎍', from: '01-01', to: '01-07',
    skin: { id: 'ev_daruma', name: 'だるま', emoji: '🎎', bg: 'linear-gradient(135deg,#ff9a9e,#fad0c4)' },
    boss: { name: '大鏡餅', icon: '🍙' },
    gear: { head: '獅子舞の頭', body: '晴れ着', feet: '紅白の草履', weapon: '破魔矢' },
  },
  {
    id: 'setsubun', name: '節分', icon: '👹', from: '02-01', to: '02-04',
    skin: { id: 'ev_oni', name: 'おに', emoji: '👹', bg: 'linear-gradient(135deg,#ff6a6a,#ffb199)' },
    boss: { name: '赤鬼の親分', icon: '👹' },
    gear: { head: '鬼の角', body: '虎柄の羽織', feet: '鬼の下駄', weapon: '福豆の升' },
  },
  {
    id: 'hanami', name: 'お花見', icon: '🌸', from: '03-25', to: '04-10',
    skin: { id: 'ev_sakura', name: 'さくら', emoji: '🌸', bg: 'linear-gradient(135deg,#fde2f3,#f9b8d6)' },
    boss: { name: '花見の大樹', icon: '🌳' },
    gear: { head: '桜の髪飾り', body: '花びらの衣', feet: '春風の靴', weapon: '夜桜の扇' },
  },
  {
    id: 'tsuyu', name: '梅雨', icon: '☔', from: '06-10', to: '06-30',
    skin: { id: 'ev_snail', name: 'かたつむり', emoji: '🐌', bg: 'linear-gradient(135deg,#c2e9fb,#a1c4fd)' },
    boss: { name: '長雨の主', icon: '🐸' },
    gear: { head: '紫陽花の帽子', body: '雨合羽', feet: '水たまりの長靴', weapon: '雷雨の傘' },
  },
  {
    id: 'natsu', name: '夏祭り', icon: '🎆', from: '07-20', to: '08-20',
    skin: { id: 'ev_suika', name: 'すいか', emoji: '🍉', bg: 'linear-gradient(135deg,#d4fc79,#ff9a9e)' },
    boss: { name: '大花火の精', icon: '🎇' },
    gear: { head: 'ひょっとこの面', body: '祭りの法被', feet: '鼻緒の下駄', weapon: '金魚すくいの網' },
  },
  {
    id: 'tsukimi', name: 'お月見', icon: '🎑', from: '09-10', to: '09-25',
    skin: { id: 'ev_moon', name: 'おつきさま', emoji: '🌕', bg: 'linear-gradient(135deg,#2c3e50,#4ca1af)' },
    boss: { name: '月のうさぎ', icon: '🐇' },
    gear: { head: 'すすきの冠', body: '月光の羽衣', feet: '団子の足袋', weapon: '十五夜の杵' },
  },
  {
    id: 'halloween', name: 'ハロウィン', icon: '🎃', from: '10-25', to: '10-31',
    skin: { id: 'ev_pumpkin', name: 'かぼちゃ', emoji: '🎃', bg: 'linear-gradient(135deg,#f7971e,#ffd200)' },
    boss: { name: 'ジャック・オ・ランタン', icon: '🎃' },
    gear: { head: '魔女の帽子', body: 'おばけのマント', feet: 'こうもりの靴', weapon: 'ジャックの鎌' },
  },
  {
    id: 'xmas', name: 'クリスマス', icon: '🎄', from: '12-18', to: '12-25',
    skin: { id: 'ev_santa', name: 'サンタ', emoji: '🎅', bg: 'linear-gradient(135deg,#ff416c,#ff4b2b)' },
    boss: { name: '雪だるま大王', icon: '⛄' },
    gear: { head: 'サンタの帽子', body: 'トナカイのセーター', feet: '雪の長靴', weapon: 'ひいらぎの杖' },
  },
  {
    id: 'oosouji', name: '年末の大掃除', icon: '🧹', from: '12-26', to: '12-31',
    skin: { id: 'ev_broom', name: 'ほうき', emoji: '🧹', bg: 'linear-gradient(135deg,#e0c3fc,#8ec5fc)' },
    boss: { name: 'ほこりの大魔神', icon: '🌪️' },
    gear: { head: '三角巾', body: '大掃除のエプロン', feet: 'ぞうきんの靴', weapon: '伝説のはたき' },
  },
]
/** その日に開催中のイベント (期間と、取ったかどうかの記録に使うキー) */
export function activeEvent(day: string) {
  const md = day.slice(5)
  const ev = EVENTS.find((e) => e.from <= md && md <= e.to)
  if (!ev) return null
  const year = day.slice(0, 4)
  return { ...ev, key: `ev_${ev.id}_${year}`, start: `${year}-${ev.from}`, end: `${year}-${ev.to}` }
}
export const EVENT_SKINS = EVENTS.map((e) => ({ ...e.skin, event: e.id, eventName: e.name }))
/** 限定スキンを持っているか (どの年のイベントでも) */
export const hasEventSkin = (achievementIds: string[], eventId: string) => achievementIds.some((a) => a.startsWith(`ev_${eventId}_`))

// ---------- 負けたときのアドバイス ----------
export function battleAdvice(r: BattleResult): string | null {
  if (r.win) return null
  const last = r.turns[r.turns.length - 1]
  const left = last ? last.enemyHp / r.enemy.hp : 1
  if (r.turns.length >= MAX_TURNS) return '時間切れ。攻撃が足りません。攻撃・会心にSPを振るか、武器を強化しましょう'
  if (left > 0.6) return `ボスの体力が${Math.round(left * 100)}%残りました。攻撃が大きく不足しています。攻撃・会心を上げるか、強い武器を装備しましょう`
  if (left > 0.25) return `ボスの体力が${Math.round(left * 100)}%残りました。攻撃か体力のどちらかをもう少し上げましょう`
  return `あと一押し（残り${Math.round(left * 100)}%）！体力・回復を少し上げると勝てそうです`
}
export const EVENT_SKIN_MAP: Record<string, (typeof EVENT_SKINS)[number]> = Object.fromEntries(EVENT_SKINS.map((s) => [s.id, s]))

// ---------- 季節イベントの限定ボス (1 日 3 回まで挑戦、勝つとその日は終わり) ----------
export const EVENT_BOSS_TRIES = 3
/** 限定ボスの強さ: 今いるステージの 1 つ前のボスより少し強い。誰でも挑めるよう、進み具合に合わせる */
export function eventBoss(ev: Pick<EventDef, 'boss'>, stage: number): Enemy {
  const base = enemyForStage(Math.max(1, stage - 1))
  return { stage: base.stage, name: ev.boss.name, icon: ev.boss.icon, hp: Math.round(base.hp * 1.4), atk: Math.round(base.atk * 1.1) }
}
/** 限定装備のレア度 (SR 以上確定。宝石の宝箱と同じ) */
export const eventGearRarity = (r: number): Rarity => srChestRarity(r)
/** 倒したときのゴールド */
export const eventBossGold = (stage: number) => 60 + stage * 20

// ---------- メンバーと腕試し (練習試合。勝っても負けても何も増減しない) ----------
export const SPAR_DAILY = 20

// ---------- 過去のボスと再戦 (倒したことのあるステージ。1 日 5 回まで、勝つと少しゴールド) ----------
export const REMATCH_DAILY = 5
/** 再戦で勝ったときのゴールド (初めて倒したときの 3 割) */
export const rematchGold = (stage: number) => Math.round(bossGold(stage) * 0.3)
