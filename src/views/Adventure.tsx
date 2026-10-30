import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BRANCHES,
  CHEST_COST,
  invMax,
  RARITY_ORDER,
  SKILLS,
  SKINS,
  SLOTS,
  STATS,
  canLearn,
  effectiveStats,
  enemyForStage,
  levelInfo,
  skinCondition,
  skinUnlocked,
  spInfo,
  winRate,
  type BattleResult,
  type Item,
  type PlayerState,
  type StatKey,
} from '../../shared/game'
import { api, HttpError, type Mission } from '../api'
import { store } from '../store'
import { bestGear } from '../../shared/optimize'
import { BattleModal } from '../components/BattleModal'
import { CharacterHeader } from '../components/CharacterHeader'
import { ChestReveal, ItemCard, ItemSheet } from '../components/Loot'
import { StageMap } from '../components/StageMap'
import { GearIcon } from '../components/GearIcon'
import { Avatar } from '../components/Dock'
import type { Celebration } from '../components/Rewards'
import { Achievements } from '../components/Achievements'
import { EventBanner, EventBossPanel, PetPanel, RaidPanel, ShopPanel, SparPanel } from '../components/GameExtras'
import type { BattleMode } from '../components/BattleModal'
import { EVENT_SKINS, REMATCH_DAILY, hasEventSkin, materialsFor, rematchGold } from '../../shared/extras'

type Tab = 'battle' | 'loot' | 'mission' | 'train' | 'achieve'

/** 持ち物の並び順: 新しい順 / レア度順 (同じなら強化の高い順) / 部位順 (頭・胴体・靴・武器、その中はレア度順) */
type InvSort = 'new' | 'rarity' | 'slot'
const INV_SORT_KEY = 'flick.sort.items'
const INV_SORTS: { key: InvSort; label: string }[] = [
  { key: 'new', label: '新しい順' },
  { key: 'rarity', label: 'レア度順' },
  { key: 'slot', label: '部位順' },
]
const rarityRank = (i: Item) => RARITY_ORDER.indexOf(i.rarity)
const slotRank = (i: Item) => SLOTS.findIndex((s) => s.key === i.slot)
// 新しい順はサーバーの並び (入手が新しい順) のまま
const INV_CMP: Record<InvSort, (a: Item, b: Item) => number> = {
  new: () => 0,
  rarity: (a, b) => rarityRank(a) - rarityRank(b) || (b.plus ?? 0) - (a.plus ?? 0) || slotRank(a) - slotRank(b),
  slot: (a, b) => slotRank(a) - slotRank(b) || rarityRank(a) - rarityRank(b) || (b.plus ?? 0) - (a.plus ?? 0),
}

interface Props {
  player: PlayerState
  name: string
  picture?: string
  onPlayer: (p: PlayerState) => void
  toast: (text: string) => void
  onCelebrate?: (c: Celebration) => void
}

export function Adventure({ player, name, picture, onPlayer, toast, onCelebrate }: Props) {
  const [tab, setTab] = useState<Tab>('battle')
  const [busy, setBusy] = useState(false)
  const [battle, setBattle] = useState<{ result: BattleResult; reward: { gold: number; item: Item | null } | null; mode?: BattleMode } | null>(null)
  // 腕試し・限定ボスのあとに一覧を読み直す
  const [arenaTick, setArenaTick] = useState(0)
  // 過去のボスと再戦: 地図で選んだステージと、今日の残り回数
  const [picked, setPicked] = useState<number | null>(null)
  const [rematchLeft, setRematchLeft] = useState<number | null>(null)
  useEffect(() => {
    api.rematchState().then((r) => setRematchLeft(r.left), () => {})
  }, [arenaTick])
  const pickedEnemy = picked ? enemyForStage(picked) : null
  const pickedRate = useMemo(() => (pickedEnemy ? winRate(player, pickedEnemy) : 0), [player, pickedEnemy?.stage])
  const [reveal, setReveal] = useState<Item | null>(null)
  const [openItem, setOpenItem] = useState<Item | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  // 持ち物の並び順 (この端末に保存)
  const [invSort, setInvSortState] = useState<InvSort>(() => {
    const v = store.get<InvSort>(INV_SORT_KEY, 'new')
    return v in INV_CMP ? v : 'new'
  })
  const setInvSort = (v: InvSort) => {
    setInvSortState(v)
    store.set(INV_SORT_KEY, v)
  }
  const items = useMemo(() => [...player.items].sort(INV_CMP[invSort]), [player.items, invSort])
  const sp = spInfo(player)
  const eff = effectiveStats(player)
  const enemy = enemyForStage(player.stage)
  const rate = useMemo(() => winRate(player, enemy), [player, enemy.stage])
  const claimable = missions.filter((m) => m.done && !m.claimed).length

  const loadMissions = useCallback(() => {
    api.missions().then((r) => setMissions(r.missions), () => {})
  }, [])
  useEffect(loadMissions, [loadMissions, player.xp])

  const run = async <T extends { player: PlayerState }>(fn: () => Promise<T>): Promise<T | null> => {
    if (busy) return null
    setBusy(true)
    try {
      const r = await fn()
      onPlayer(r.player)
      return r
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '失敗しました')
      return null
    } finally {
      setBusy(false)
    }
  }

  // おまかせ装備: 組み合わせをシミュレーションで比べて、一番勝てるものをまとめて装備する
  const [optimizing, setOptimizing] = useState(false)
  const autoEquip = async () => {
    setOptimizing(true)
    // 計算の前に「考え中」を描くため 1 フレーム待つ
    await new Promise((ok) => setTimeout(ok, 30))
    try {
      const best = bestGear(player)
      if (!best.changed) {
        toast(`今の装備が一番です（勝率 ${Math.round(best.rate * 100)}%）`)
        return
      }
      const set = Object.fromEntries(SLOTS.map((s) => [s.key, best.equipped[s.key] ?? null]))
      const r = await run(() => api.equipSet(set))
      if (!r) return
      // 勝率が変わらないとき (どちらも 0% や 100%) は、攻撃と体力の変化を出す
      const a = effectiveStats(player)
      const b = effectiveStats(r.player)
      const before = Math.round(best.before * 100)
      const after = Math.round(best.rate * 100)
      toast(before !== after ? `おまかせで装備しました（勝率 ${before}% → ${after}%）` : `おまかせで装備しました（攻撃 ${a.atk}→${b.atk}・体力 ${a.hp}→${b.hp}）`)
    } finally {
      setOptimizing(false)
    }
  }

  const challenge = async () => {
    const r = await run(api.battle)
    if (r) {
      setBattle({ result: r.result, reward: r.reward })
      loadMissions()
    }
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'battle', label: 'バトル' },
    { key: 'loot', label: '宝箱' },
    { key: 'mission', label: 'ミッション', badge: claimable },
    { key: 'train', label: '育成', badge: Math.max(0, sp.free) },
    { key: 'achieve', label: '実績' },
  ]

  return (
    <div className="adv" data-testid="adventure">
      <CharacterHeader name={name} picture={picture} player={player} gold />
      <EventBanner refresh={player.xp} />

      <div className="sub-tabs glass" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`sub-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)} data-testid={`adv-${t.key}`}>
            {tab === t.key && <motion.span layoutId="sub-pill" className="stab-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span className="stab-label">{t.label}</span>
            {!!t.badge && <span className="sub-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'battle' && (
        <>
          <RaidPanel
            refresh={player.xp}
            toast={toast}
            onReward={(r) => {
              onPlayer(r.player)
              if (r.item) setReveal(r.item)
              toast(`💰${r.gold} を受け取りました`)
            }}
          />
          <EventBossPanel
            player={player}
            busy={busy}
            refresh={arenaTick}
            onFight={async () => {
              const r = await run(api.fightEventBoss)
              if (r) {
                setBattle({ result: r.result, reward: r.reward, mode: 'event' })
                setArenaTick((n) => n + 1)
              }
            }}
          />
          <section className="panel glass boss" data-testid="boss">
            <div className="boss-icon">{enemy.icon}</div>
            <div className="boss-body">
              <div className="boss-stage">ステージ {enemy.stage}</div>
              <div className="boss-name">{enemy.name}</div>
              <div className="boss-stats">
                HP {enemy.hp} ・ 攻撃 {enemy.atk}
              </div>
              <div className="rate">
                <div className="rate-bar">
                  <span style={{ width: `${Math.round(rate * 100)}%` }} className={rate >= 0.6 ? 'good' : rate >= 0.3 ? 'mid' : 'bad'} />
                </div>
                <span className="rate-text" data-testid="win-rate">
                  勝率 {Math.round(rate * 100)}%
                </span>
              </div>
            </div>
            <button className="pill-btn primary" onClick={challenge} disabled={busy} data-testid="fight">
              挑戦
            </button>
          </section>
          <section className="panel glass">
            <div className="panel-head">
              <h2>冒険の地図</h2>
              <span className="muted">{player.stage > 1 ? '倒したボスを押すと再戦' : '撃破で 💰 と 🎁'}</span>
            </div>
            <StageMap stage={player.stage} picked={picked} onPick={(n) => setPicked(picked === n ? null : n)} />
            {pickedEnemy && (
              <div className="rematch-bar" data-testid="rematch">
                <span className="rematch-icon">{pickedEnemy.icon}</span>
                <span className="rematch-body">
                  <b>
                    再戦 ステージ{pickedEnemy.stage} {pickedEnemy.name}
                  </b>
                  <span className="muted">
                    勝率 {Math.round(pickedRate * 100)}% ・ 勝つと💰{rematchGold(pickedEnemy.stage)}（ステージは進みません）
                  </span>
                </span>
                <button
                  className="pill-btn primary small"
                  disabled={busy || rematchLeft === 0}
                  onClick={async () => {
                    const r = await run(() => api.rematch(pickedEnemy.stage))
                    if (r) {
                      setBattle({ result: r.result, reward: r.reward, mode: 'rematch' })
                      setRematchLeft(r.left)
                      loadMissions()
                    }
                  }}
                  data-testid="rematch-fight"
                >
                  {rematchLeft === 0 ? 'また明日' : `再戦（今日あと${rematchLeft ?? REMATCH_DAILY}回）`}
                </button>
              </div>
            )}
          </section>
          <SparPanel
            busy={busy}
            refresh={arenaTick}
            onSpar={async (p) => {
              setBusy(true)
              try {
                const r = await api.spar(p.id)
                setBattle({ result: r.result, reward: null, mode: 'spar' })
                setArenaTick((n) => n + 1)
              } catch (e) {
                toast(e instanceof HttpError && e.reason ? e.reason : '失敗しました')
              } finally {
                setBusy(false)
              }
            }}
          />
          <section className="panel glass mine">
            <div className="mine-stats">
              {STATS.map((s) => (
                <span key={s.key}>
                  {s.label} <b>{eff[s.key]}</b>
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === 'loot' && (
        <>
          <section className="panel glass chest-panel">
            <div className="chest-icon">🎁</div>
            <div className="chest-body">
              <div className="chest-title">宝箱</div>
              <div className="muted">N 69.5% ・ R 18% ・ SR 9% ・ SSR 3% ・ UR 0.5%</div>
            </div>
            <button
              className="pill-btn primary"
              disabled={busy || player.gold < CHEST_COST || player.items.length >= invMax(player)}
              data-testid="open-chest"
              onClick={async () => {
                const r = await run(api.chest)
                if (r) setReveal(r.item)
              }}
            >
              💰{CHEST_COST}
            </button>
          </section>

          <ShopPanel
            player={player}
            busy={busy}
            onBuy={async (id) => {
              const r = await run(() => api.buy(id))
              if (!r) return
              if (r.item) setReveal(r.item)
              else toast(id === 'boost' ? 'XP2倍チケットを手に入れました' : id === 'bag' ? '持ち物の枠が増えました' : 'みんなに差し入れしました 🍩')
            }}
          />

          <section className="panel glass">
            <div className="panel-head">
              <h2>装備中</h2>
              {player.items.length > 0 && (
                <button className="pill-btn primary small" disabled={busy || optimizing} onClick={autoEquip} data-testid="auto-equip" title="持っている装備から、今のボスに一番勝ちやすい組み合わせを選びます">
                  {optimizing ? '考え中…' : '✨ おまかせ装備'}
                </button>
              )}
            </div>
            <div className="equip-slots">
              {SLOTS.map((s) => {
                const item = player.items.find((i) => i.id === player.equipped[s.key])
                return (
                  <button key={s.key} className={`equip-slot ${item ? `r-${item.rarity}` : 'vacant'}`} onClick={() => item && setOpenItem(item)} data-testid={`slot-${s.key}`}>
                    <span className="slot-part">{s.label}</span>
                    <GearIcon slot={s.key} rarity={item?.rarity} />
                    <span className="slot-label">{item?.name ?? 'なし'}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>持ち物</h2>
              <span className="muted">
                {player.items.length}/{invMax(player)}
              </span>
            </div>
            {player.items.length > 1 && (
              <div className="sort-row inv-sort" role="radiogroup" aria-label="持ち物の並び順" data-testid="inv-sort">
                {INV_SORTS.map((s) => (
                  <button key={s.key} role="radio" aria-checked={invSort === s.key} className={`sort-btn ${invSort === s.key ? 'on' : ''}`} onClick={() => setInvSort(s.key)} data-testid={`inv-sort-${s.key}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {player.items.length === 0 ? (
              <p className="muted">宝箱を開けるか、ボスを倒すと手に入ります</p>
            ) : (
              <div className="inv-grid">
                {items.map((it) => (
                  <ItemCard key={it.id} item={it} equipped={Object.values(player.equipped).includes(it.id)} onClick={() => setOpenItem(it)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'achieve' && <Achievements player={player} busy={busy} onTitle={(id) => run(() => api.setTitle(id))} />}

      {tab === 'mission' && (
        <section className="panel glass" data-testid="missions">
          <div className="panel-head">
            <h2>今日のミッション</h2>
            <span className="muted">毎日 0 時に更新</span>
          </div>
          <ul className="mission-list">
            {missions.map((m) => (
              <li key={m.id} className={`mission ${m.claimed ? 'claimed' : m.done ? 'ready' : ''}`}>
                <div className="mission-body">
                  <div className="mission-label">{m.label}</div>
                  <div className="mission-bar">
                    <span style={{ transform: `scaleX(${m.value / m.goal})` }} />
                  </div>
                  <div className="muted">
                    {m.value}/{m.goal} ・ {m.chest ? '🎁 宝箱' : `💰${m.gold}`}
                  </div>
                </div>
                <button
                  className="pill-btn primary small"
                  disabled={!m.done || m.claimed || busy}
                  data-testid={`claim-${m.id}`}
                  onClick={async () => {
                    const r = await run(() => api.claim(m.id))
                    if (!r) return
                    setMissions(r.missions)
                    if (r.item) setReveal(r.item)
                    else toast(`💰${r.gold} を受け取りました`)
                  }}
                >
                  {m.claimed ? '受取済' : '受け取る'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'train' && (
        <>
          <PetPanel player={player} busy={busy} onPet={(id) => run(() => api.setPet(id))} />

          <section className="panel glass" data-testid="skins">
            <div className="panel-head">
              <h2>スキン</h2>
              <span className="muted">レベル・ステージで解放、💰で買えるものも</span>
            </div>
            <div className="skin-grid">
              <button className={`skin ${!player.skin ? 'on' : ''}`} disabled={busy || !player.skin} onClick={() => run(() => api.setSkin(null))} data-testid="skin-photo">
                <Avatar name={name} picture={picture} size={44} />
                <span className="skin-name">写真</span>
              </button>
              {SKINS.map((s) => {
                const open = skinUnlocked(s, levelInfo(player.xp).level, player.stage, player.ownedSkins)
                const on = player.skin === s.id
                // ゴールドで買うスキン: 買う前は値段を出し、押すと買ってそのまま着替える
                if (s.price && !open) {
                  return (
                    <button
                      key={s.id}
                      className="skin shop"
                      disabled={busy || player.gold < s.price}
                      onClick={async () => {
                        if (await run(() => api.buySkin(s.id))) toast(`スキン「${s.name}」を買いました`)
                      }}
                      data-testid={`skin-${s.id}`}
                      title={`💰${s.price}で買う`}
                    >
                      <Avatar name={s.name} skin={s.id} size={44} />
                      <span className="skin-name">💰{s.price}</span>
                    </button>
                  )
                }
                return (
                  <button
                    key={s.id}
                    className={`skin ${on ? 'on' : ''} ${open ? '' : 'locked'}`}
                    disabled={busy || on || !open}
                    onClick={() => run(() => api.setSkin(s.id))}
                    data-testid={`skin-${s.id}`}
                    title={open ? s.name : skinCondition(s)}
                  >
                    {open ? <Avatar name={s.name} skin={s.id} size={44} /> : <span className="skin-lock">🔒</span>}
                    <span className="skin-name">{open ? s.name : skinCondition(s)}</span>
                  </button>
                )
              })}
              {EVENT_SKINS.map((s) => {
                const open = hasEventSkin((player.achievements ?? []).map((a) => a.id), s.event)
                const on = player.skin === s.id
                return (
                  <button key={s.id} className={`skin event ${on ? 'on' : ''} ${open ? '' : 'locked'}`} disabled={busy || on || !open} onClick={() => run(() => api.setSkin(s.id))} data-testid={`skin-${s.id}`}>
                    {open ? <Avatar name={s.name} skin={s.id} size={44} /> : <span className="skin-lock">{s.emoji}</span>}
                    <span className="skin-name">{open ? s.name : `${s.eventName}限定`}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel glass" data-testid="jobs">
            <div className="panel-head">
              <h2>冒険職</h2>
              <span className="muted">いつでも変更できます</span>
            </div>
            <div className="job-list">
              {player.jobs.map((j) => {
                const on = j.id === player.job.id
                return (
                  <button
                    key={j.id}
                    className={`job ${on ? 'on' : ''} ${j.tier === 2 ? 'adv' : ''}`}
                    disabled={busy || on}
                    onClick={() => run(() => api.setJob(j.id))}
                    data-testid={`job-${j.id}`}
                  >
                    <span className="job-icon">{j.icon}</span>
                    <span className="job-body">
                      <span className="job-name">
                        {j.name}
                        {j.tier === 2 && <em>上位職</em>}
                      </span>
                      <span className="job-desc">{j.desc}</span>
                      <span className="job-lv">
                        職業Lv {j.max ? 'MAX' : j.level}
                        <span className="job-bar">
                          <span style={{ transform: `scaleX(${j.current / j.next})` }} />
                        </span>
                      </span>
                    </span>
                    {on && <span className="job-on">選択中</span>}
                  </button>
                )
              })}
            </div>
            <p className="muted job-note">今の職業の職業Lvが1上がるごとに攻撃・体力+1%（最大+30%）</p>
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>ステータス</h2>
              <span className={`sp-pill ${sp.free > 0 ? 'on' : ''}`} data-testid="sp-free">
                SP {Math.max(0, sp.free)}
              </span>
            </div>
            <ul className="stat-list">
              {STATS.map((s) => (
                <li key={s.key} className="stat-row">
                  <span className="stat-label">{s.label}</span>
                  <span className="stat-value" data-testid={`stat-${s.key}`}>
                    {eff[s.key as StatKey]}
                    <small>{s.unit}</small>
                  </span>
                  <span className="stat-pts">+{player.stats[s.key]}</span>
                  <button
                    className="plus"
                    aria-label={`${s.label}を上げる`}
                    data-testid={`plus-${s.key}`}
                    disabled={busy || sp.free < 1}
                    onClick={() => run(() => api.addStat(s.key))}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>スキル</h2>
              {sp.spent > 0 && (
                <button
                  className={`reset-btn ${confirmReset ? 'confirm' : ''}`}
                  data-testid="reset"
                  onClick={() => {
                    if (!confirmReset) return setConfirmReset(true)
                    setConfirmReset(false)
                    run(api.resetBuild)
                  }}
                  onBlur={() => setConfirmReset(false)}
                >
                  {confirmReset ? '本当に振り直す？' : '↺ SPを振り直す'}
                </button>
              )}
            </div>
            {BRANCHES.map((b) => (
              <div key={b.key} className="branch">
                <div className="branch-head">
                  {b.icon} {b.label}
                </div>
                <div className="skill-row">
                  {SKILLS.filter((s) => s.branch === b.key).map((s) => {
                    const owned = player.skills.includes(s.id)
                    const reason = canLearn(player, s.id)
                    const locked = !owned && !!s.requires && !player.skills.includes(s.requires)
                    return (
                      <button
                        key={s.id}
                        className={`skill ${owned ? 'owned' : locked ? 'locked' : reason ? 'short' : 'ready'}`}
                        data-testid={`skill-${s.id}`}
                        disabled={owned || !!reason || busy}
                        onClick={async () => {
                          const r = await run(() => api.learn(s.id))
                          // 知恵 × 攻撃/守護 の組み合わせで隠しスキルが現れたらお祝い
                          const found = r?.revealed?.[0]
                          if (found) onCelebrate?.({ label: 'SECRET SKILL', title: `✦ ${found.name}`, sub: `${found.combo} で隠しスキルが現れた` })
                        }}
                        title={reason ?? ''}
                      >
                        <span className="skill-name">{s.name}</span>
                        <span className="skill-desc">{s.desc}</span>
                        <span className="skill-cost">{owned ? '習得済み' : `${s.cost} SP`}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {player.secretSkills.length > 0 && (
              <div className="branch secret" data-testid="secret-skills">
                <div className="branch-head">✦ 隠しスキル</div>
                <div className="skill-row">
                  {player.secretSkills.map((s) => {
                    const short = !s.owned && sp.free < s.cost
                    return (
                      <button
                        key={s.id}
                        className={`skill secret-skill ${s.owned ? 'owned' : short ? 'short' : 'ready'}`}
                        data-testid={`secret-${s.id}`}
                        disabled={s.owned || short || busy}
                        onClick={() => run(() => api.learn(s.id))}
                      >
                        <span className="skill-name">{s.name}</span>
                        <span className="skill-combo">{s.combo}</span>
                        <span className="skill-desc">{s.desc}</span>
                        <span className="skill-cost">{s.owned ? '習得済み' : `${s.cost} SP`}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <AnimatePresence>
        {battle && (
          <BattleModal
            result={battle.result}
            reward={battle.reward}
            mode={battle.mode}
            onClose={() => {
              setBattle(null)
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{reveal && <ChestReveal item={reveal} onClose={() => setReveal(null)} />}</AnimatePresence>
      <AnimatePresence>
        {openItem && (
          <ItemSheet
            item={openItem}
            equipped={Object.values(player.equipped).includes(openItem.id)}
            current={player.items.find((i) => i.id === player.equipped[openItem.slot]) ?? null}
            busy={busy}
            onClose={() => setOpenItem(null)}
            onEquip={async (on) => {
              if (await run(() => api.equip(openItem.id, on))) setOpenItem(null)
            }}
            onSell={async () => {
              if (await run(() => api.sell(openItem.id))) setOpenItem(null)
            }}
            materials={materialsFor(openItem, player.items, Object.values(player.equipped) as string[])}
            gold={player.gold}
            onEnhance={async (by, material) => {
              const r = await run(() => api.enhance(openItem.id, by, material))
              if (r) {
                const next = r.player.items.find((i) => i.id === openItem.id)
                if (next) setOpenItem(next)
                toast(next ? `+${next.plus ?? 0} になりました` : '強化しました')
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
