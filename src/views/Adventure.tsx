import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BRANCHES,
  CHEST_COST,
  INVENTORY_MAX,
  SKILLS,
  SLOTS,
  STATS,
  canLearn,
  effectiveStats,
  enemyForStage,
  spInfo,
  winRate,
  type BattleResult,
  type Item,
  type PlayerState,
  type StatKey,
} from '../../shared/game'
import { api, HttpError, type Mission } from '../api'
import { BattleModal } from '../components/BattleModal'
import { CharacterHeader } from '../components/CharacterHeader'
import { ChestReveal, ItemCard, ItemSheet } from '../components/Loot'
import { StageMap } from '../components/StageMap'

type Tab = 'battle' | 'loot' | 'mission' | 'train'

interface Props {
  player: PlayerState
  name: string
  picture?: string
  onPlayer: (p: PlayerState) => void
  toast: (text: string) => void
}

export function Adventure({ player, name, picture, onPlayer, toast }: Props) {
  const [tab, setTab] = useState<Tab>('battle')
  const [busy, setBusy] = useState(false)
  const [battle, setBattle] = useState<{ result: BattleResult; reward: { gold: number; item: Item | null } | null } | null>(null)
  const [reveal, setReveal] = useState<Item | null>(null)
  const [openItem, setOpenItem] = useState<Item | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
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
  ]

  return (
    <div className="adv" data-testid="adventure">
      <CharacterHeader name={name} picture={picture} player={player} gold />

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
              <span className="muted">撃破で 💰 と 🎁</span>
            </div>
            <StageMap stage={player.stage} />
          </section>
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
              <div className="muted">N 70% ・ R 18% ・ SR 9% ・ SSR 3%</div>
            </div>
            <button
              className="pill-btn primary"
              disabled={busy || player.gold < CHEST_COST || player.items.length >= INVENTORY_MAX}
              data-testid="open-chest"
              onClick={async () => {
                const r = await run(api.chest)
                if (r) setReveal(r.item)
              }}
            >
              💰{CHEST_COST}
            </button>
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>装備中</h2>
            </div>
            <div className="equip-slots">
              {SLOTS.map((s) => {
                const item = player.items.find((i) => i.id === player.equipped[s.key])
                return (
                  <button key={s.key} className={`equip-slot ${item ? `r-${item.rarity}` : 'empty'}`} onClick={() => item && setOpenItem(item)} data-testid={`slot-${s.key}`}>
                    <span className="slot-icon">{item?.icon ?? '＋'}</span>
                    <span className="slot-label">{item?.name ?? s.label}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel glass">
            <div className="panel-head">
              <h2>持ち物</h2>
              <span className="muted">
                {player.items.length}/{INVENTORY_MAX}
              </span>
            </div>
            {player.items.length === 0 ? (
              <p className="muted">宝箱を開けるか、ボスを倒すと手に入ります</p>
            ) : (
              <div className="inv-grid">
                {player.items.map((it) => (
                  <ItemCard key={it.id} item={it} equipped={Object.values(player.equipped).includes(it.id)} onClick={() => setOpenItem(it)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

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
              {player.resets > 0 && (
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
                  {confirmReset ? '振り直す？' : `📕 リセットの書 ×${player.resets}`}
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
                        onClick={() => run(() => api.learn(s.id))}
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
          </section>
        </>
      )}

      <AnimatePresence>
        {battle && (
          <BattleModal
            result={battle.result}
            reward={battle.reward}
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
          />
        )}
      </AnimatePresence>
    </div>
  )
}
