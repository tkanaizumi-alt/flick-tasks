import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { BattleResult } from '../../shared/game'

const TURN_MS = 420

/** サーバーで決まった戦闘結果をターンごとに再生する (演出は transform / 幅のみで軽量) */
export function BattleModal({ result, onClose }: { result: BattleResult; onClose: () => void }) {
  const [step, setStep] = useState(0) // 再生済みターン数
  const done = step >= result.turns.length
  const turn = step > 0 ? result.turns[step - 1] : null
  const hp = turn ? turn.hp : result.maxHp
  const enemyHp = turn ? turn.enemyHp : result.enemy.hp

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 350 : TURN_MS)
    return () => clearTimeout(t)
  }, [step, done])

  const lines = result.turns.slice(Math.max(0, step - 3), step)

  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={done ? onClose : undefined} />
      <motion.div
        className="battle glass"
        role="dialog"
        aria-label="バトル"
        data-testid="battle"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
      >
        <div key={step} className={`battle-enemy ${turn?.hits.length ? 'hit' : ''}`}>
          {result.enemy.icon}
        </div>
        <div className="battle-name">{result.enemy.name}</div>
        <Bar label="敵" value={enemyHp} max={result.enemy.hp} kind="enemy" />
        <Bar label="自分" value={hp} max={result.maxHp} kind="me" />

        <ul className="battle-log">
          {lines.map((t) => (
            <li key={t.turn}>
              <b>{t.turn}</b>
              {t.hits.map((h, i) => (
                <span key={i} className={h.crit || h.smash ? 'big' : ''}>
                  {h.smash ? '渾身 ' : ''}
                  {h.crit ? '会心 ' : ''}⚔️{h.dmg}
                </span>
              ))}
              {t.taken > 0 && <span className="taken">💥{t.taken}</span>}
              {t.healed > 0 && <span className="healed">✚{t.healed}</span>}
              {t.guts && <span className="big">不屈！</span>}
            </li>
          ))}
        </ul>

        {done ? (
          <motion.div className="battle-result" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-testid="battle-result">
            <div className={`result-title ${result.win ? 'win' : 'lose'}`}>{result.win ? '勝利！' : '敗北…'}</div>
            <div className="result-sub">
              {result.win
                ? `ステージ ${result.enemy.stage + 1} 解放 ・ 📕 リセットの書 +1`
                : `あと ${Math.round((enemyHp / result.enemy.hp) * 100)}% 削れば勝てる`}
            </div>
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
