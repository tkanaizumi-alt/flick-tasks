import type { Person } from '../../shared/types'
import { MAIN_STAGES, enemyForStage } from '../../shared/game'
import { Avatar } from './Dock'

/** 誰がどのステージにいるかを一目で: 30 ステージの道に各自のアイコンを置く */
export function StageBoard({ people, onOpen }: { people: Person[]; onOpen: (id: string) => void }) {
  const pos = (stage: number) => `${(Math.min(stage, MAIN_STAGES) - 1) / (MAIN_STAGES - 1) * 100}%`
  return (
    <section className="panel glass board" data-testid="stage-board">
      <div className="panel-head">
        <h2>冒険の進み具合</h2>
      </div>
      <div className="track-head" aria-hidden="true">
        {[1, 10, 20, 30].map((n) => (
          <span key={n} style={{ left: pos(n) }}>
            {enemyForStage(n).icon}
            <small>{n}</small>
          </span>
        ))}
      </div>
      <div className="tracks">
        {people.map((p) => {
          const boss = enemyForStage(p.stage)
          return (
            <button key={p.id} className={`track-row ${p.isMe ? 'me' : ''}`} onClick={() => onOpen(p.id)} data-testid="board-row">
              <span className="track-name">{p.name}</span>
              <span className="track">
                <span className="track-fill" style={{ width: pos(p.stage) }} />
                {[10, 20].map((n) => (
                  <i key={n} className="track-tick" style={{ left: pos(n) }} />
                ))}
                <span className="track-me" style={{ left: pos(p.stage) }}>
                  <Avatar name={p.name} picture={p.picture} size={24} />
                </span>
              </span>
              <span className="track-stage">
                {p.stage > MAIN_STAGES ? `🗼${p.stage - MAIN_STAGES}F` : `${boss.icon}${p.stage}`}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
