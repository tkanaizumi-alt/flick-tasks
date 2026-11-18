import { useState } from 'react'
import { motion } from 'motion/react'
import { battleAdvice } from '../../shared/extras'
import type { Item, PlayerState } from '../../shared/game'
import { TB_ACTIONS, TB_GAUGE_MAX, canAct, type TbState, type TurnAction } from '../../shared/turn'
import { api, HttpError, type TurnBattleInfo } from '../api'
import { ItemCard } from './Loot'
import { Fighters, type FighterMoment } from './Fighters'

const KIND_LABEL = { stage: 'ステージ', rematch: '再戦', event: '限定ボス' } as const

/** 次のターンの敵の様子 (作戦のヒント) */
const intent = (s: TbState) =>
  s.next === 'heavy'
    ? { cls: 'danger', text: '⚠️ 敵は力をためている！ 次は強攻撃（まもると軽くなる）' }
    : s.next === 'charge'
      ? { cls: 'calm', text: '😤 敵は力をためようとしている（このターンは攻撃してこない）' }
      : { cls: '', text: '⚔️ 敵は攻撃してくる' }

/** 1 ターンの出来事を 1 行で */
function turnText(t: TbState['turns'][number]) {
  const act = TB_ACTIONS.find((a) => a.id === t.action)!
  const mine =
    t.action === 'guard'
      ? '身を守った'
      : t.action === 'heal'
        ? `体力 +${t.potion}`
        : `${t.hits.reduce((a, h) => a + h.dmg, 0)}ダメージ${t.hits.some((h) => h.crit) ? '（会心！）' : ''}`
  const foe = t.enemyMove === 'charge' ? '敵は力をためている' : t.dodged ? '敵の攻撃をかわした！' : `${t.enemyMove === 'heavy' ? '敵の強攻撃' : '敵の攻撃'} -${t.taken}`
  return `${act.icon} ${act.label}: ${mine} ／ ${foe}${t.guts ? '（不屈！）' : ''}${t.revive ? '（復活！）' : ''}`
}

export function TurnBattleModal({
  battle,
  me,
  onClose,
  onPlayer,
  toast,
}: {
  battle: TurnBattleInfo
  me: { name: string; picture?: string; skin?: string | null }
  onClose: () => void
  onPlayer: (p: PlayerState) => void
  toast: (t: string) => void
}) {
  const [s, setS] = useState<TbState>(battle.state)
  const [busy, setBusy] = useState(false)
  const [reward, setReward] = useState<{ gold: number; item: Item | null; seed?: boolean } | null>(null)
  const turn = s.turns[s.turns.length - 1] ?? null
  const step = s.turns.length

  const act = async (a: TurnAction) => {
    if (busy || canAct(s, a)) return
    setBusy(true)
    try {
      const r = await api.turnAct(battle.id, a)
      setS(r.state)
      if (r.reward) setReward(r.reward)
      if (r.player) onPlayer(r.player)
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '通信できませんでした。もう一度押してください')
    } finally {
      setBusy(false)
    }
  }

  const crit = !!turn?.hits.some((h) => h.crit)
  const moment: FighterMoment | null = turn
    ? {
        meAttack: turn.hits.length > 0,
        foeHurt: turn.hits.length > 0,
        foeAttack: turn.enemyMove !== 'charge' && (turn.taken > 0 || turn.dodged),
        meHurt: turn.taken > 0,
        meEmote: turn.special ? '💥' : turn.guarded ? '🛡️' : turn.potion ? '🧪' : turn.dodged ? '💨' : turn.guts ? '😤' : crit ? '✨' : undefined,
        foeEmote: turn.enemyMove === 'charge' ? '😤' : turn.enemyMove === 'heavy' ? '💢' : undefined,
      }
    : null
  const it = intent(s)
  const title = battle.kind === 'stage' ? `ステージ ${s.enemy.stage} ${s.enemy.name}` : `${KIND_LABEL[battle.kind]} ${s.enemy.name}`

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={s.done ? onClose : undefined} />
      <motion.div
        className={`battle glass turn-battle ${turn?.special || crit ? 'flash' : ''}`}
        role="dialog"
        aria-label="ターン制バトル"
        data-testid="turn-battle"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <div className="battle-stage">
          <Fighters me={me} foe={{ icon: s.enemy.icon }} moment={moment} step={step} done={s.done} win={s.win} />
          {turn && !s.done && (
            <div key={`d${step}`} className="dmg-layer" aria-hidden="true">
              {turn.hits.map((h, i) => (
                <span key={i} className={`dmg ${h.crit || h.smash || turn.special ? 'crit' : ''}`} style={{ left: `${74 + i * 10}%` }}>
                  {h.dmg}
                  {turn.special ? <small>必殺!</small> : h.crit ? <small>会心!</small> : null}
                </span>
              ))}
              {turn.taken > 0 && <span className="dmg taken">-{turn.taken}</span>}
              {turn.potion + turn.healed > 0 && <span className="dmg heal">+{turn.potion + turn.healed}</span>}
              {turn.dodged && <span className="dmg heal">回避!</span>}
            </div>
          )}
        </div>
        <div className="battle-name">{title}</div>
        <Bar label="敵" value={s.enemyHp} max={s.enemy.hp} kind="enemy" />
        <Bar label="自分" value={s.hp} max={s.maxHp} kind="me" />
        <div className="tb-gauge" data-testid="tb-gauge">
          <span className="hp-label">必殺</span>
          <div className={`hp-track ${s.gauge >= TB_GAUGE_MAX ? 'full' : ''}`}>
            <span style={{ transform: `scaleX(${s.gauge / TB_GAUGE_MAX})` }} />
          </div>
          <span className="hp-num">🧪×{s.potions}</span>
        </div>
        <div className="battle-turn" data-testid="tb-log">
          {turn ? `ターン ${turn.turn} ・ ${turnText(turn)}` : 'ターン制バトル開始！ 行動を選んでください'}
        </div>

        {s.done ? (
          <motion.div className="battle-result" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="battle-result">
            {s.win && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 5) * 0.06}s` }} />
                ))}
              </div>
            )}
            <div className={`result-title ${s.win ? 'win' : 'lose'}`}>{s.win ? '勝利！' : '敗北…'}</div>
            {s.win && reward ? (
              <div className="result-rewards">
                <span>💰 +{reward.gold}</span>
                {battle.kind === 'stage' && <span>ステージ {s.enemy.stage + 1} へ</span>}
                {reward.seed && <span className="seed-get">🌱 SPのタネ！ SP+1</span>}
                {reward.item && (
                  <div className="result-item">
                    <ItemCard item={reward.item} />
                  </div>
                )}
              </div>
            ) : !s.win ? (
              <div className="result-sub" data-testid="battle-advice">
                💡 {s.turns.length >= 30 ? '時間切れ。攻撃が足りません' : battleAdvice({ win: false, turns: s.turns, maxHp: s.maxHp, enemy: s.enemy })}
              </div>
            ) : null}
            <button className="pill-btn primary" onClick={onClose} data-testid="battle-close">
              閉じる
            </button>
          </motion.div>
        ) : (
          <>
            <div className={`tb-intent ${it.cls}`} data-testid="tb-intent">
              {it.text}
            </div>
            <div className="tb-actions">
              {TB_ACTIONS.map((a) => {
                const why = canAct(s, a.id)
                return (
                  <button key={a.id} className={`tb-act ${a.id} ${a.id === 'skill' && !why ? 'ready' : ''}`} disabled={busy || !!why} onClick={() => act(a.id)} title={why ?? a.desc} data-testid={`tb-${a.id}`}>
                    <span className="tb-icon">{a.icon}</span>
                    <b>{a.label}</b>
                    {a.id === 'heal' && <small>残り{s.potions}</small>}
                    {a.id === 'skill' && <small>{s.gauge >= TB_GAUGE_MAX ? '使える！' : `${s.gauge}%`}</small>}
                  </button>
                )
              })}
            </div>
            <button className="skip" onClick={onClose} data-testid="tb-later">
              あとで続ける
            </button>
          </>
        )}
      </motion.div>
    </>
  )
}

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'me' | 'enemy' }) {
  return (
    <div className={`hp hp-${kind}`}>
      <span className="hp-label">{label}</span>
      <div className="hp-track">
        <span style={{ transform: `scaleX(${Math.max(0, value) / max})` }} />
      </div>
      <span className="hp-num">
        {Math.max(0, value)}/{max}
      </span>
    </div>
  )
}
