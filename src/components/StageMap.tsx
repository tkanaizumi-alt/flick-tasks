import { MAIN_STAGES, enemyForStage } from '../../shared/game'

const CHAPTER = 10

/**
 * 30 ステージの道のり (10 ごとに章)。現在地を強調し、終焉の竜の先は塔の階数。
 * onPick があれば、倒したボスを押して再戦の相手に選べる
 */
export function StageMap({ stage, picked, onPick }: { stage: number; picked?: number | null; onPick?: (n: number) => void }) {
  const chapters = Array.from({ length: MAIN_STAGES / CHAPTER }, (_, c) => c)
  return (
    <div className="stage-map-wrap" data-testid="stage-map">
      {chapters.map((c) => {
        const from = c * CHAPTER + 1
        const cleared = Math.min(CHAPTER, Math.max(0, stage - from))
        return (
          <section key={c} className={`chapter ${stage < from ? 'future' : ''}`}>
            <div className="chapter-head">
              第{c + 1}章 <span className="muted">{cleared}/{CHAPTER}</span>
            </div>
            <ol className="stage-map">
              {Array.from({ length: CHAPTER }, (_, i) => {
                const n = from + i
                const e = enemyForStage(n)
                const state = n < stage ? 'cleared' : n === stage ? 'current' : 'locked'
                const body = (
                  <>
                    <span className="sn-icon">{state === 'locked' ? '？' : e.icon}</span>
                    <span className="sn-num">{n}</span>
                  </>
                )
                return (
                  <li key={n} className={`stage-node ${state} ${n % CHAPTER === 0 ? 'boss' : ''} ${picked === n ? 'picked' : ''}`} title={state === 'locked' ? '？' : e.name}>
                    {state === 'cleared' && onPick ? (
                      <button className="sn-btn" onClick={() => onPick(n)} aria-label={`ステージ${n} ${e.name}と再戦`} aria-pressed={picked === n} data-testid="rematch-pick">
                        {body}
                      </button>
                    ) : (
                      body
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
      {stage > MAIN_STAGES && (
        <div className="stage-node current tower">
          <span className="sn-icon">🗼</span>
          <span className="sn-num">{stage - MAIN_STAGES}F</span>
        </div>
      )}
    </div>
  )
}
