import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { battleAdvice } from '../../shared/extras'
import type { BattleResult, Item } from '../../shared/game'
import { ItemCard } from './Loot'

const TURN_MS = 380

interface Props {
  result: BattleResult
  reward: { gold: number; item: Item | null } | null
  onClose: () => void
}

/** サーバーで決まった戦闘結果をターンごとに再生する (演出は transform / opacity のみで軽量) */
export function BattleModal({ result, reward, onClose }: Props) {
  const [step, setStep] = useState(0) // 再生済みターン数
  const done = step >= result.turns.length
  const turn = step > 0 ? result.turns[step - 1] : null
  const hp = turn ? turn.hp : result.maxHp
  const enemyHp = turn ? turn.enemyHp : result.enemy.hp
  const big = turn?.hits.some((h) => h.crit || h.smash)

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 450 : TURN_MS)
    return () => clearTimeout(t)
  }, [step, done])

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done ? onClose : undefined} />
      <motion.div
        className={`battle glass ${big && !done ? 'flash' : ''}`}
        role="dialog"
        aria-label="バトル"
        data-testid="battle"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <div className="battle-stage">
          <div key={`e${step}`} className={`battle-enemy ${turn?.hits.length ? 'hit' : ''} ${done && result.win ? 'down' : ''}`}>
            {result.enemy.icon}
          </div>
          {/* ダメージ数値をターンごとに浮かせる */}
          {turn && !done && (
            <div key={`d${step}`} className="dmg-layer" aria-hidden="true">
              {turn.hits.map((h, i) => (
                <span key={i} className={`dmg ${h.crit || h.smash ? 'crit' : ''}`} style={{ left: `${42 + i * 16}%` }}>
                  {h.dmg}
                  {h.crit && <small>会心!</small>}
                  {h.smash && <small>渾身!</small>}
                </span>
              ))}
              {turn.taken > 0 && <span className="dmg taken">-{turn.taken}</span>}
              {turn.healed > 0 && <span className="dmg heal">+{turn.healed}</span>}
              {turn.guts && <span className="dmg crit guts">不屈!</span>}
              {turn.revive && <span className="dmg crit guts">復活!</span>}
              {turn.dodged && <span className="dmg heal">回避!</span>}
            </div>
          )}
        </div>
        <div className="battle-name">
          ステージ {result.enemy.stage} {result.enemy.name}
        </div>
        <Bar label="敵" value={enemyHp} max={result.enemy.hp} kind="enemy" />
        <Bar label="自分" value={hp} max={result.maxHp} kind="me" />
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
            {result.win && reward ? (
              <div className="result-rewards">
                <span>💰 +{reward.gold}</span>
                <span>ステージ {result.enemy.stage + 1} へ</span>
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
          <button className="skip" onClick={() => setStep(result.turns.length)} data-testid="battle-skip">
            スキップ
          </button>
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
