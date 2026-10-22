import { useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import {
  BRANCHES,
  SKILLS,
  STATS,
  canLearn,
  effectiveStats,
  enemyForStage,
  spInfo,
  winRate,
  type BattleResult,
  type PlayerState,
  type StatKey,
} from '../../shared/game'
import { api, HttpError } from '../api'
import { BattleModal } from '../components/BattleModal'
import { CharacterHeader } from '../components/CharacterHeader'

interface Props {
  player: PlayerState
  name: string
  picture?: string
  onPlayer: (p: PlayerState) => void
  toast: (text: string) => void
}

export function Adventure({ player, name, picture, onPlayer, toast }: Props) {
  const [busy, setBusy] = useState(false)
  const [battle, setBattle] = useState<BattleResult | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const sp = spInfo(player)
  const eff = effectiveStats(player)
  const enemy = enemyForStage(player.stage)
  const rate = useMemo(() => winRate(player, enemy), [player, enemy.stage])

  const run = async (fn: () => Promise<{ player: PlayerState }>) => {
    if (busy) return
    setBusy(true)
    try {
      onPlayer((await fn()).player)
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const challenge = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { result, player: next } = await api.battle()
      setBattle(result)
      onPlayer(next)
    } catch {
      toast('失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adv" data-testid="adventure">
      <CharacterHeader name={name} picture={picture} player={player} />

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

      <AnimatePresence>{battle && <BattleModal result={battle} onClose={() => setBattle(null)} />}</AnimatePresence>
    </div>
  )
}
