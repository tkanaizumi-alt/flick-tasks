import { useEffect, useState } from 'react'
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, TIERS, type AchievementStats } from '../../shared/achievements'
import type { PlayerState } from '../../shared/game'
import { api } from '../api'

/** 実績の一覧。取ったものは称号として名前の横に出せる */
export function Achievements({ player, busy, onTitle }: { player: PlayerState; busy: boolean; onTitle: (id: string | null) => void }) {
  const [stats, setStats] = useState<AchievementStats | null>(null)
  useEffect(() => {
    api.player().then((r) => setStats(r.stats ?? null), () => {})
  }, [player.xp])
  // 季節イベントの記録 (ev_...) は実績の数に入れない
  const got = new Map((player.achievements ?? []).filter((a) => ACHIEVEMENT_MAP[a.id]).map((a) => [a.id, a.at]))

  return (
    <section className="panel glass" data-testid="achievements">
      <div className="panel-head">
        <h2>実績</h2>
        <span className="muted">
          {got.size}/{ACHIEVEMENTS.length} ・ 🔥{stats?.streak ?? player.streak ?? 0}日連続（最長{stats?.bestStreak ?? 0}日）
        </span>
      </div>
      <p className="muted ach-note">
        取った実績をタップすると、称号として名前の横に表示されます。難しい実績ほど称号の色が豪華になります（
        {([1, 2, 3, 4] as const).map((t, i) => (
          <span key={t}>
            {i > 0 && ' → '}
            <span className={`title-chip t-${TIERS[t].key}`}>{TIERS[t].label}</span>
          </span>
        ))}
        ）。
      </p>
      <ul className="ach-list">
        {ACHIEVEMENTS.map((a) => {
          const at = got.get(a.id)
          const on = player.title === a.id
          const value = Math.min(stats?.[a.stat] ?? 0, a.goal)
          const tier = TIERS[a.tier ?? 1]
          return (
            <li key={a.id}>
              <button
                className={`ach t-${tier.key} ${at ? 'got' : 'locked'} ${on ? 'on' : ''}`}
                disabled={!at || busy}
                onClick={() => onTitle(on ? null : a.id)}
                data-testid={`ach-${a.id}`}
              >
                <span className="ach-icon">{at ? a.icon : '🔒'}</span>
                <span className="ach-body">
                  <span className="ach-name">
                    {a.name}
                    <span className={`title-chip tier-chip t-${tier.key}`} data-testid="ach-tier">
                      {tier.label}
                    </span>
                  </span>
                  <span className="ach-desc">{a.desc}</span>
                  {!at && stats && (
                    <span className="ach-bar">
                      <span style={{ transform: `scaleX(${value / a.goal})` }} />
                    </span>
                  )}
                </span>
                <span className="ach-side">{on ? '称号にしています' : at ? new Date(at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : stats ? `${value}/${a.goal}` : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
