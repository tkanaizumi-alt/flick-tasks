import { MAIN_STAGES, OPEN_STAGES, enemyForStage } from '../../shared/game'

const CHAPTER = 10

/**
 * ステージの道のり (10 ごとに章)。現在地を強調する。
 * 第1〜3章 (30 ステージ) は最初から見える。その先 (31〜100) はシークレットで、倒したボスと次のボスだけが出る。
 * 100 の先は無限の塔の階数。onPick があれば、倒したボスを押して再戦の相手に選べる
 */
export function StageMap({ stage, picked, onPick }: { stage: number; picked?: number | null; onPick?: (n: number) => void }) {
  // 見える章: 最初の 3 章 + 足を踏み入れたシークレットの章
  const reached = Math.min(stage, MAIN_STAGES)
  const chapters = Array.from({ length: Math.max(OPEN_STAGES, Math.ceil(reached / CHAPTER) * CHAPTER) / CHAPTER }, (_, c) => c)
  return (
    <div className="stage-map-wrap" data-testid="stage-map">
      {chapters.map((c) => {
        const from = c * CHAPTER + 1
        const secret = from > OPEN_STAGES
        const cleared = Math.min(CHAPTER, Math.max(0, stage - from))
        // シークレットの章は、倒したステージと今のステージだけ
        const count = secret ? Math.min(CHAPTER, Math.max(0, stage - from + 1)) : CHAPTER
        return (
          <section key={c} className={`chapter ${stage < from ? 'future' : ''} ${secret ? 'secret' : ''}`} data-testid={secret ? 'secret-chapter' : undefined}>
            <div className="chapter-head">
              {secret ? `🌌 シークレット 第${c + 1}章` : `第${c + 1}章`} <span className="muted">{secret ? `${cleared}/？` : `${cleared}/${CHAPTER}`}</span>
            </div>
            <ol className="stage-map">
              {Array.from({ length: count }, (_, i) => {
                const n = from + i
                const e = enemyForStage(n)
                const state = n < stage ? 'cleared' : n === stage ? 'current' : 'locked'
                const hide = state === 'locked'
                const body = (
                  <>
                    <span className="sn-icon">{hide ? '？' : e.icon}</span>
                    <span className="sn-num">{n}</span>
                  </>
                )
                return (
                  <li key={n} className={`stage-node ${state} ${n % CHAPTER === 0 ? 'boss' : ''} ${picked === n ? 'picked' : ''}`} title={hide ? '？' : e.name}>
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
