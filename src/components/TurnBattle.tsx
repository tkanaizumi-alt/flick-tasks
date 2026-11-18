import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { battleAdvice } from '../../shared/extras'
import type { Item, PlayerState } from '../../shared/game'
import { SPECIALS, TB_ACTIONS, TB_GAUGE_MAX, TECHS, canAct, type TbState, type TbTurn, type TurnAction } from '../../shared/turn'
import { api, HttpError, type TurnBattleInfo } from '../api'
import { ItemCard } from './Loot'
import { BattleScene, HpBar, themeFor, timeline, type Beat } from './BattleScene'

const KIND_LABEL = { stage: 'ステージ', rematch: '再戦', event: '限定ボス' } as const

/** 次のターンの敵の様子 (作戦のヒント) */
const intent = (s: TbState) => {
  const breaker = s.techs.map((t) => TECHS[t]).find((t) => t.stun)
  return s.next === 'heavy'
    ? { cls: 'danger', text: '⚠️ 敵は力をためている！ 次は強攻撃（まもると軽くなる）' }
    : s.next === 'charge'
      ? { cls: 'calm', text: `😤 敵は力をためようとしている${breaker ? `（${breaker.name}で崩せるかも）` : '（このターンは攻撃してこない）'}` }
      : { cls: '', text: '⚔️ 敵は攻撃してくる' }
}

/** 使ったわざ・必殺技の名前 */
const actName = (t: TbTurn) => {
  if (t.special) return `${SPECIALS[t.tech ?? 'basic']?.icon ?? '💥'} ${SPECIALS[t.tech ?? 'basic']?.name ?? '必殺技'}`
  if (t.tech && TECHS[t.tech]) return `${TECHS[t.tech].icon} ${TECHS[t.tech].name}`
  const a = TB_ACTIONS.find((x) => x.id === t.action)
  return a ? `${a.icon} ${a.label}` : '⚔️ たたかう'
}

/** 1 ターンの出来事を 1 行で */
function turnText(t: TbTurn) {
  const dmg = t.hits.reduce((a, h) => a + h.dmg, 0)
  const mine = [dmg > 0 ? `${dmg}ダメージ${t.hits.some((h) => h.crit) ? '（会心！）' : ''}` : '', t.guarded ? '身を守った' : '', t.potion > 0 ? `体力 +${t.potion}` : '']
    .filter(Boolean)
    .join('・')
  const foe = t.stunned
    ? t.enemyMove === 'charge'
      ? 'ためを崩した！'
      : '敵はひるんだ！'
    : t.enemyMove === 'charge'
      ? '敵は力をためている'
      : t.dodged
        ? '敵の攻撃をかわした！'
        : t.taken > 0
          ? `${t.enemyMove === 'heavy' ? '敵の強攻撃' : '敵の攻撃'} -${t.taken}`
          : ''
  const extra = `${t.dot ? `（毒・やけど -${t.dot}）` : ''}${t.guts ? '（不屈！）' : ''}${t.revive ? '（復活！）' : ''}`
  return `${actName(t)}: ${mine || '—'}${foe ? ` ／ ${foe}` : ''}${extra}`
}

/** 画面の演出用に、1 ターンの出来事をまとめる */
function beatOf(t: TbTurn): Beat {
  const sp = t.special ? SPECIALS[t.tech ?? 'basic'] ?? SPECIALS.basic : null
  const tech = t.tech && TECHS[t.tech] ? TECHS[t.tech] : null
  const acted = t.taken > 0 || t.dodged
  return {
    fx: t.fx ?? (t.hits.length ? 'slash' : null),
    hits: t.hits,
    special: sp ? { name: sp.name, icon: sp.icon } : undefined,
    tech: tech ? { name: tech.name, icon: tech.icon } : undefined,
    guard: t.guarded,
    potion: t.potion,
    foe: t.stunned ? 'none' : t.enemyMove === 'charge' ? 'charge' : acted ? t.enemyMove : 'none',
    stunned: t.stunned,
    dodged: t.dodged,
    taken: t.taken,
    healed: t.healed,
    dot: t.dot,
    guts: t.guts,
    revive: t.revive,
  }
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
  // 演出を再生している間はボタンを押せない (結果は先に届いているが、見せ終わるまで待つ)
  const [playing, setPlaying] = useState(false)
  const [reward, setReward] = useState<{ gold: number; item: Item | null; seed?: boolean } | null>(null)
  // 開き直したときは、前のターンの演出を出さない
  const [shown, setShown] = useState(battle.state.turns.length)
  const step = s.turns.length
  const turn = step > shown ? s.turns[step - 1] : null
  const beat = turn ? beatOf(turn) : null
  const t = timeline(beat)
  const finished = s.done && !playing

  useEffect(() => {
    if (!turn) return
    setPlaying(true)
    const id = setTimeout(() => setPlaying(false), t.end + 120)
    return () => clearTimeout(id)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (a: TurnAction) => {
    if (busy || playing || canAct(s, a)) return
    setBusy(true)
    try {
      const r = await api.turnAct(battle.id, a)
      setShown((n) => Math.min(n, r.state.turns.length - 1))
      setS(r.state)
      if (r.reward) setReward(r.reward)
      if (r.player) onPlayer(r.player)
    } catch (e) {
      toast(e instanceof HttpError && e.reason ? e.reason : '通信できませんでした。もう一度押してください')
    } finally {
      setBusy(false)
    }
  }

  const it = intent(s)
  const title = battle.kind === 'stage' ? `ステージ ${s.enemy.stage} ${s.enemy.name}` : `${KIND_LABEL[battle.kind]} ${s.enemy.name}`
  const special = SPECIALS[s.special] ?? SPECIALS.basic
  const st = s.status
  // ボタン: たたかう・わざ・必殺技・まもる・回復薬
  const buttons: { id: TurnAction; icon: string; label: string; sub?: string; cls: string; desc: string }[] = [
    { id: 'attack', icon: '⚔️', label: 'たたかう', cls: 'attack', desc: TB_ACTIONS[0].desc },
    ...s.techs.map((id) => {
      const tc = TECHS[id]
      const left = s.cd[id] ?? 0
      return { id, icon: tc.icon, label: tc.name, sub: left > 0 ? `あと${left}` : 'わざ', cls: `tech ${left > 0 ? 'cool' : ''}`, desc: tc.desc }
    }),
    { id: 'skill', icon: special.icon, label: special.name, sub: s.gauge >= TB_GAUGE_MAX ? '使える！' : `${s.gauge}%`, cls: `skill ${s.gauge >= TB_GAUGE_MAX ? 'ready' : ''}`, desc: `必殺技: ${special.desc}` },
    { id: 'guard', icon: '🛡️', label: 'まもる', cls: 'guard', desc: TB_ACTIONS[2].desc },
    { id: 'heal', icon: '🧪', label: '回復薬', sub: `残り${s.potions}`, cls: 'heal', desc: TB_ACTIONS[3].desc },
  ]

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={finished ? onClose : undefined} />
      <motion.div
        className="battle big glass turn-battle"
        role="dialog"
        aria-label="ターン制バトル"
        data-testid="turn-battle"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <BattleScene
          me={me}
          foe={s.enemy}
          theme={themeFor(s.enemy.stage, battle.kind)}
          beat={finished ? null : beat}
          step={step}
          done={finished}
          win={s.win}
          charging={s.next === 'heavy' && !playing && !s.done}
          aura={{ atk: st.atk > 0, guard: st.guard > 0 }}
        />
        <div className="battle-name">{title}</div>
        <HpBar label="敵" value={s.enemyHp} max={s.enemy.hp} kind="enemy" delay={turn ? t.hit : 0} />
        <HpBar label="自分" value={s.hp} max={s.maxHp} kind="me" delay={turn ? t.foeHit : 0} />
        <div className="tb-gauge" data-testid="tb-gauge">
          <span className="hp-label">必殺</span>
          <div className={`hp-track ${s.gauge >= TB_GAUGE_MAX ? 'full' : ''}`}>
            <span style={{ transform: `scaleX(${s.gauge / TB_GAUGE_MAX})` }} />
          </div>
          <span className="hp-num">🧪×{s.potions}</span>
        </div>
        <div className="tb-status" data-testid="tb-status">
          {st.atk > 0 && <span className="up">🔥 攻撃+{Math.round(st.atkValue * 100)}% 残り{st.atk}</span>}
          {st.guard > 0 && <span className="def">🏰 守り 残り{st.guard}</span>}
          {st.weaken > 0 && <span className="foe">✨ 敵の攻撃↓ 残り{st.weaken}</span>}
          {st.dot > 0 && <span className="foe">☠️ 毒・やけど 残り{st.dot}</span>}
        </div>
        <div className="battle-turn" data-testid="tb-log">
          {s.turns.length ? `ターン ${s.turns[s.turns.length - 1].turn} ・ ${turnText(s.turns[s.turns.length - 1])}` : 'ターン制バトル開始！ 行動を選んでください'}
        </div>

        {finished ? (
          <motion.div className="battle-result" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }} data-testid="battle-result">
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
            <div className={`tb-intent ${playing ? '' : it.cls}`} data-testid="tb-intent">
              {playing ? '…' : it.text}
            </div>
            <div className="tb-actions">
              {buttons.map((b) => {
                const why = canAct(s, b.id)
                return (
                  <button
                    key={b.id}
                    className={`tb-act ${b.cls}`}
                    disabled={busy || playing || !!why}
                    onClick={() => act(b.id)}
                    title={why ?? b.desc}
                    data-testid={`tb-${b.id}`}
                  >
                    <span className="tb-icon">{b.icon}</span>
                    <b>{b.label}</b>
                    {b.sub && <small>{b.sub}</small>}
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
