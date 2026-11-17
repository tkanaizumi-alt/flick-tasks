import { useEffect, useMemo, useState } from 'react'
import { SET_NEED, equippedItems, levelInfo, setCounts, setEffectLabel, type Item, type PlayerState } from '../../shared/game'
import { CODEX_REWARDS, codexClaimable, codexOf } from '../../shared/collection'
import { api, HttpError, type CoopState } from '../api'
import { Avatar } from './Dock'
import { GearIcon } from './GearIcon'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 週替わりの協力クエスト: みんなで 1 つの目標。達成したら全員が報酬を受け取れる */
export function CoopPanel({ refresh, toast, onReward }: { refresh: number; toast: (t: string) => void; onReward: (r: { gold: number; item: Item | null; player: PlayerState }) => void }) {
  const [s, setS] = useState<CoopState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.coop().then(setS, () => {})
  }, [refresh])
  if (!s) return null
  const claim = async () => {
    setBusy(true)
    try {
      const r = await api.claimCoop()
      onReward(r)
      setS({ ...s, claimed: true })
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '受け取れませんでした')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel glass coop" data-testid="coop">
      <div className="panel-head">
        <h2>協力クエスト</h2>
        <span className="muted">〜{md(s.until)}・達成で全員に報酬</span>
      </div>
      <div className="coop-body">
        <div className={`coop-icon ${s.done ? 'done' : ''}`}>{s.quest.icon}</div>
        <div className="coop-main">
          <div className="coop-label" data-testid="coop-label">
            {s.quest.label}
          </div>
          <div className="mission-bar">
            <span style={{ transform: `scaleX(${Math.min(1, s.value / s.quest.goal)})` }} />
          </div>
          <div className="muted">
            {s.done ? '達成！' : `${s.value} / ${s.quest.goal}`} ・ あなた {s.mine} ・ 報酬 💰{s.gold}＋🎁SR以上
          </div>
        </div>
      </div>
      <ul className="raid-rank">
        {s.ranking
          .filter((p) => p.value > 0)
          .slice(0, 6)
          .map((p, i) => (
            <li key={p.id}>
              <span className="raid-no">{i + 1}</span>
              <Avatar name={p.name} picture={p.picture} skin={p.skin} size={22} />
              <span className="raid-who">{p.name}</span>
              <b>{p.value}</b>
            </li>
          ))}
      </ul>
      {s.done && (
        <button className="pill-btn primary raid-claim" disabled={busy || s.claimed} onClick={claim} data-testid="coop-claim">
          {s.claimed ? '受け取り済み' : '🎁 報酬を受け取る'}
        </button>
      )}
    </section>
  )
}

/** 身につけている装備のセット効果 (1 つ以上あるシリーズ) */
export function SetSummary({ player }: { player: PlayerState }) {
  const list = setCounts(equippedItems(player))
  if (!list.length) return <p className="muted set-note">同じシリーズの装備を{SET_NEED}部位そろえると「セット効果」が発動します</p>
  return (
    <ul className="set-list" data-testid="sets">
      {list.map(({ set, count, on }) => (
        <li key={set.id} className={`set-row ${on ? 'on' : ''}`}>
          <span className="set-name">🧩 {set.name}</span>
          <span className="set-count">
            {count}/{set.pieces.length}
          </span>
          <span className="set-fx">{on ? `発動中: ${setEffectLabel(set)}` : `あと${SET_NEED - count}部位で ${setEffectLabel(set)}`}</span>
        </li>
      ))}
    </ul>
  )
}

/** 図鑑: 手に入れた装備・倒したボス・解放したスキン。うめた割合でご褒美 */
export function CodexPanel({ player, onPlayer, toast }: { player: PlayerState; onPlayer: (p: PlayerState) => void; toast: (t: string) => void }) {
  const [names, setNames] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    api.codex().then((r) => setNames(r.names), () => setNames([]))
  }, [player.items.length])
  const achieved = useMemo(() => (player.achievements ?? []).map((a) => a.id), [player.achievements])
  const c = useMemo(
    () => codexOf({ names: names ?? [], stage: player.stage, level: levelInfo(player.xp).level, ownedSkins: player.ownedSkins ?? [], achieved }),
    [names, player.stage, player.xp, player.ownedSkins, achieved],
  )
  if (!names) return null
  const claimed = player.codexClaimed ?? 0
  const ready = codexClaimable(c.pct, claimed)
  const next = CODEX_REWARDS[claimed]
  const claim = async () => {
    setBusy(true)
    try {
      const r = await api.claimCodex()
      onPlayer(r.player)
      toast(`図鑑のご褒美 💰${r.gold} を受け取りました`)
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '受け取れませんでした')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel glass codex" data-testid="codex">
      <div className="panel-head">
        <h2>📖 図鑑</h2>
        <span className="muted" data-testid="codex-pct">
          {c.got}/{c.total}（{c.pct}%）
        </span>
      </div>
      <div className="mission-bar">
        <span style={{ transform: `scaleX(${c.total ? c.got / c.total : 0})` }} />
      </div>
      <div className="codex-rewards">
        {CODEX_REWARDS.map((r, i) => (
          <span key={r.pct} className={`codex-reward ${i < claimed ? 'got' : c.pct >= r.pct ? 'ready' : ''}`}>
            {r.pct}% 💰{r.gold}
          </span>
        ))}
      </div>
      {ready.length > 0 ? (
        <button className="pill-btn primary codex-claim" disabled={busy} onClick={claim} data-testid="codex-claim">
          🎁 ご褒美を受け取る（💰{ready.reduce((a, r) => a + r.gold, 0)}）
        </button>
      ) : (
        <p className="muted">{next ? `${next.pct}%で 💰${next.gold}` : 'ご褒美はすべて受け取りました'}・季節の限定装備は割合に数えません</p>
      )}
      {c.sections.map((s) => {
        const got = s.entries.filter((e) => e.got).length
        const shown = open === s.key
        return (
          <div key={s.key} className="codex-sec">
            <button className="codex-sec-head" onClick={() => setOpen(shown ? null : s.key)} aria-expanded={shown} data-testid={`codex-${s.key}`}>
              <b>{s.label}</b>
              <span className="muted">
                {got}/{s.entries.length}
              </span>
              <span className="codex-caret">{shown ? '▲' : '▼'}</span>
            </button>
            {shown && (
              <ul className="codex-grid">
                {s.entries.map((e) => (
                  <li key={e.id} className={`codex-cell ${e.got ? 'got' : ''} ${e.rarity ? `r-${e.rarity}` : ''}`} title={e.got ? e.name : '？？？'}>
                    <span className="codex-icon">{e.slot ? e.got ? <GearIcon slot={e.slot} rarity={e.rarity} size={26} /> : '❔' : e.got ? e.icon : '❔'}</span>
                    <span className="codex-name">{e.got ? e.name : '？？？'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </section>
  )
}
