import { useEffect, useState } from 'react'
import { BAG_MAX_BUYS, BAG_STEP, BOOST_COUNT, EVENT_GOAL, EVENT_XP, PETS, SHOP, petEffect, petProgress, petUnlocked, shopPrice, type ShopId } from '../../shared/extras'
import { ACHIEVEMENT_MAP, type AchievementStats } from '../../shared/achievements'
import type { Item, PlayerState } from '../../shared/game'
import { api, HttpError, type EventState, type Mvp, type RaidState } from '../api'
import { Avatar } from './Dock'

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** 今週のレイドボス: 全員の今週の XP がダメージになる */
export function RaidPanel({ onReward, toast, refresh }: { onReward: (r: { gold: number; item: Item | null; player: PlayerState }) => void; toast: (t: string) => void; refresh: number }) {
  const [s, setS] = useState<RaidState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.raid().then(setS, () => {})
  }, [refresh])
  if (!s) return null
  const left = Math.max(0, s.boss.hp - s.damage)
  const claim = async () => {
    setBusy(true)
    try {
      const r = await api.claimRaid()
      onReward(r)
      setS({ ...s, claimed: true })
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '受け取れませんでした')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel glass raid" data-testid="raid">
      <div className="panel-head">
        <h2>週のレイドボス</h2>
        <span className="muted">〜{md(s.until)}・みんなのXPがダメージに</span>
      </div>
      <div className="raid-body">
        <div className={`raid-icon ${s.defeated ? 'down' : ''}`}>{s.boss.icon}</div>
        <div className="raid-main">
          <div className="raid-name">{s.boss.name}</div>
          <div className="raid-bar">
            <span style={{ transform: `scaleX(${left / s.boss.hp})` }} />
          </div>
          <div className="muted">
            {s.defeated ? '撃破！' : `HP ${left} / ${s.boss.hp}`} ・ あなた {s.mine} ダメージ
          </div>
        </div>
      </div>
      <ul className="raid-rank">
        {s.ranking
          .filter((p) => p.damage > 0)
          .slice(0, 6)
          .map((p, i) => (
            <li key={p.id}>
              <span className="raid-no">{i + 1}</span>
              <Avatar name={p.name} picture={p.picture} skin={p.skin} size={22} />
              <span className="raid-who">{p.name}</span>
              <b>{p.damage}</b>
            </li>
          ))}
      </ul>
      {s.defeated && (
        <button className="pill-btn primary raid-claim" disabled={busy || s.claimed || s.mine <= 0} onClick={claim} data-testid="raid-claim">
          {s.claimed ? '受け取り済み' : s.mine <= 0 ? '今週ダメージを与えた人だけ受け取れます' : '🎁 報酬を受け取る'}
        </button>
      )}
    </section>
  )
}

/** 開催中の季節イベント */
export function EventBanner({ refresh }: { refresh: number }) {
  const [ev, setEv] = useState<EventState | null>(null)
  useEffect(() => {
    api.event().then((r) => setEv(r.event), () => {})
  }, [refresh])
  if (!ev) return null
  return (
    <section className="panel glass event-banner" data-testid="event">
      <div className="event-icon">{ev.icon}</div>
      <div className="event-body">
        <div className="event-name">
          {ev.name}開催中 <span className="muted">〜{md(ev.end)}</span>
        </div>
        <div className="muted">
          タスクのXP+{Math.round(EVENT_XP * 100)}% ・ {EVENT_GOAL}件完了で限定スキン「{ev.skin.emoji} {ev.skin.name}」
        </div>
        <div className="mission-bar">
          <span style={{ transform: `scaleX(${Math.min(1, ev.done / EVENT_GOAL)})` }} />
        </div>
        <div className="muted">{ev.got ? '限定スキンを手に入れました（育成 → スキン）' : `${Math.min(ev.done, EVENT_GOAL)} / ${EVENT_GOAL}`}</div>
      </div>
    </section>
  )
}

/** ショップ */
export function ShopPanel({ player, busy, onBuy }: { player: PlayerState; busy: boolean; onBuy: (id: ShopId) => void }) {
  return (
    <section className="panel glass" data-testid="shop">
      <div className="panel-head">
        <h2>ショップ</h2>
        {(player.boostLeft ?? 0) > 0 && <span className="muted">🎫 XP2倍 残り{player.boostLeft}回</span>}
      </div>
      <ul className="shop-list">
        {SHOP.map((s) => {
          const price = shopPrice(s.id, player.invExtra)
          const bagFull = s.id === 'bag' && (player.invExtra ?? 0) >= BAG_STEP * BAG_MAX_BUYS
          const treated = s.id === 'treat' && player.treated
          const desc =
            s.id === 'boost' ? `次の${BOOST_COUNT}回の完了でXPが2倍` : s.id === 'bag' ? `持てる装備が${BAG_STEP}個増える（今 +${player.invExtra ?? 0} / 最大 +${BAG_STEP * BAG_MAX_BUYS}）` : s.desc
          return (
            <li key={s.id} className="shop-item">
              <span className="shop-icon">{s.icon}</span>
              <span className="shop-body">
                <b>{s.name}</b>
                <span className="muted">{desc}</span>
              </span>
              <button className="pill-btn primary small" disabled={busy || bagFull || treated || player.gold < price} onClick={() => onBuy(s.id)} data-testid={`buy-${s.id}`}>
                {bagFull ? '最大' : treated ? '今日は済み' : `💰${price}`}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** ペット (実績の数や働き方で仲間になる) */
export function PetPanel({ player, busy, onPet }: { player: PlayerState; busy: boolean; onPet: (id: string | null) => void }) {
  const count = (player.achievements ?? []).filter((a) => ACHIEVEMENT_MAP[a.id]).length
  // 働き方で仲間になるペットの条件 (大以上の完了数など) は集計から
  const [stats, setStats] = useState<AchievementStats | null>(null)
  useEffect(() => {
    api.player().then((r) => setStats(r.stats ?? null), () => {})
  }, [player.xp])
  return (
    <section className="panel glass" data-testid="pets">
      <div className="panel-head">
        <h2>ペット</h2>
        <span className="muted">実績の数や働き方で仲間になります（実績 {count}個）</span>
      </div>
      <div className="pet-grid">
        {PETS.map((p) => {
          const open = petUnlocked(p, count, stats)
          const on = player.pet === p.id
          return (
            <button key={p.id} className={`pet ${on ? 'on' : ''} ${open ? '' : 'locked'}`} disabled={busy || !open} onClick={() => onPet(on ? null : p.id)} data-testid={`pet-${p.id}`}>
              <span className="pet-emoji">{open ? p.emoji : '🔒'}</span>
              <span className="pet-name">{p.name}</span>
              <span className="pet-need">{open ? '' : `${p.need.label}（${petProgress(p, count, stats)}/${p.need.goal}）`}</span>
              <span className="pet-fx">{petEffect(p)}</span>
              {on && <span className="pet-on">連れている</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** 先週の MVP */
export function MvpPanel() {
  const [m, setM] = useState<Mvp | null>(null)
  useEffect(() => {
    api.mvp().then(setM, () => {})
  }, [])
  if (!m || (!m.done && !m.xp && !m.helps)) return null
  const rows: { label: string; icon: string; unit: string; v: Mvp['done'] }[] = [
    { label: 'いちばん完了', icon: '🏆', unit: '件', v: m.done },
    { label: 'いちばん成長', icon: '⭐', unit: 'XP', v: m.xp },
    { label: 'いちばん手伝った', icon: '🤝', unit: '回', v: m.helps },
  ]
  return (
    <section className="panel glass mvp" data-testid="mvp">
      <div className="panel-head">
        <h2>先週のMVP</h2>
        <span className="muted">
          {md(m.week)}〜{md(m.until)}
        </span>
      </div>
      <ul>
        {rows
          .filter((r) => r.v)
          .map((r) => (
            <li key={r.label}>
              <span className="mvp-icon">{r.icon}</span>
              <span className="mvp-label">{r.label}</span>
              <span className="mvp-who">
                {r.v!.winners.map((w) => (
                  <span key={w.id} className="mvp-person">
                    <Avatar name={w.name} picture={w.picture} skin={w.skin} size={22} />
                    {w.name}
                  </span>
                ))}
              </span>
              <b>
                {r.v!.value}
                {r.unit}
              </b>
            </li>
          ))}
      </ul>
    </section>
  )
}
