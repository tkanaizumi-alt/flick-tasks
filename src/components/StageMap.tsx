import { enemyForStage } from '../../shared/game'

const MAIN_STAGES = 10

/** 10 ステージの道のり。現在地を強調し、魔王の先は塔の階数 */
export function StageMap({ stage }: { stage: number }) {
  return (
    <ol className="stage-map" data-testid="stage-map">
      {Array.from({ length: MAIN_STAGES }, (_, i) => {
        const n = i + 1
        const e = enemyForStage(n)
        const state = n < stage ? 'cleared' : n === stage ? 'current' : 'locked'
        return (
          <li key={n} className={`stage-node ${state}`} title={e.name}>
            <span className="sn-icon">{state === 'locked' ? '？' : e.icon}</span>
            <span className="sn-num">{n}</span>
          </li>
        )
      })}
      {stage > MAIN_STAGES && (
        <li className="stage-node current tower">
          <span className="sn-icon">🗼</span>
          <span className="sn-num">{stage - MAIN_STAGES}F</span>
        </li>
      )}
    </ol>
  )
}
