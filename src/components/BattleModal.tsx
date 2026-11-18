import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { battleAdvice } from '../../shared/extras'
import type { BattleResult, Item } from '../../shared/game'
import { ItemCard } from './Loot'
import { BattleScene, HpBar, SPEEDS, SPEED_KEY, themeFor, timeline, type Beat } from './BattleScene'
import { store } from '../store'

export type BattleMode = 'stage' | 'spar' | 'event' | 'rematch'

interface Props {
  result: BattleResult
  reward: { gold: number; item: Item | null; seed?: boolean } | null
  onClose: () => void
  /** stage: ステージのボス / spar: メンバーと腕試し / event: 季節イベントの限定ボス / rematch: 過去のボスと再戦 */
  mode?: BattleMode
  /** 自分のキャラ (装備を着たアバターで出す) */
  me: { name: string; picture?: string; skin?: string | null }
}

/** サーバーで決まった戦闘結果を、1 ターンずつ短い動画のように再生する (演出は transform / opacity のみで軽量) */
export function BattleModal({ result, reward, onClose, mode = 'stage', me }: Props) {
  const [step, setStep] = useState(0) // 再生済みターン数
  const [speed, setSpeedState] = useState<number>(() => {
    const v = store.get<number>(SPEED_KEY, 1)
    return (SPEEDS as readonly number[]).includes(v) ? v : 1
  })
  const setSpeed = (v: number) => {
    setSpeedState(v)
    store.set(SPEED_KEY, v)
  }
  const done = step >= result.turns.length
  const turn = step > 0 ? result.turns[step - 1] : null
  const hp = turn ? turn.hp : result.maxHp
  const enemyHp = turn ? turn.enemyHp : result.enemy.hp
  const beat: Beat | null = turn
    ? {
        fx: turn.hits.length ? 'slash' : null,
        hits: turn.hits,
        foe: turn.taken > 0 || turn.dodged ? 'attack' : 'none',
        dodged: turn.dodged,
        taken: turn.taken,
        healed: turn.healed,
        guts: turn.guts,
        revive: turn.revive,
      }
    : null
  const t = timeline(beat)
  const k = 1 / speed

  useEffect(() => {
    if (done) return
    const wait = step === 0 ? 500 : (t.end + 160) * k
    const id = setTimeout(() => setStep((s) => s + 1), wait)
    return () => clearTimeout(id)
  }, [step, done, t.end, k])

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done ? onClose : undefined} />
      <motion.div
        className="battle big glass"
        role="dialog"
        aria-label="バトル"
        data-testid="battle"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <BattleScene me={me} foe={result.enemy} theme={themeFor(result.enemy.stage, mode)} beat={beat} step={step} done={done} win={result.win} speed={speed} />
        <div className="battle-name">
          {mode === 'spar'
            ? `${result.enemy.name}と腕試し`
            : mode === 'event'
              ? `限定ボス ${result.enemy.name}`
              : `${mode === 'rematch' ? '再戦 ' : ''}ステージ ${result.enemy.stage} ${result.enemy.name}`}
        </div>
        <HpBar label={mode === 'spar' ? '相手' : '敵'} value={enemyHp} max={result.enemy.hp} kind="enemy" delay={turn ? t.hit * k : 0} />
        <HpBar label="自分" value={hp} max={result.maxHp} kind="me" delay={turn ? t.foeHit * k : 0} />
        <div className="battle-turn">{turn ? `ターン ${turn.turn}` : 'バトル開始！'}</div>

        {done ? (
          <motion.div className="battle-result" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="battle-result">
            {result.win && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 5) * 0.06}s` }} />
                ))}
              </div>
            )}
            <div className={`result-title ${result.win ? 'win' : 'lose'}`}>{result.win ? '勝利！' : '敗北…'}</div>
            {mode === 'spar' ? (
              <div className="result-sub" data-testid="spar-note">
                {result.win ? '🤝 練習試合なので、XP・ゴールドは変わりません' : '🤝 練習試合なので、何も失いません。装備やスキルを見直してまた挑戦！'}
              </div>
            ) : result.win && reward ? (
              <div className="result-rewards">
                <span>💰 +{reward.gold}</span>
                {mode === 'stage' && <span>ステージ {result.enemy.stage + 1} へ</span>}
                {reward.seed && (
                  <span className="seed-get" data-testid="seed-get">
                    🌱 SPのタネ！ SP+1
                  </span>
                )}
                {reward.item && (
                  <div className="result-item">
                    <ItemCard item={reward.item} />
                  </div>
                )}
              </div>
            ) : (
              <div className="result-sub" data-testid="battle-advice">
                💡 {battleAdvice(result)}
              </div>
            )}
            <button className="pill-btn primary" onClick={onClose} data-testid="battle-close">
              閉じる
            </button>
          </motion.div>
        ) : (
          <div className="battle-tools">
            <button className="speed-btn" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length])} data-testid="battle-speed">
              ⏩ ×{speed}
            </button>
            <button className="skip" onClick={() => setStep(result.turns.length)} data-testid="battle-skip">
              スキップ
            </button>
          </div>
        )}
      </motion.div>
    </>
  )
}

