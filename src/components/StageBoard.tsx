import type { Person } from '../../shared/types'
import { enemyForStage } from '../../shared/game'
import { Avatar } from './Dock'

const MAIN = 10

/** 誰がどのステージにいるかを一目で: 列 = ボス、行 = 人、現在地にアバター */
export function StageBoard({ people, onOpen }: { people: Person[]; onOpen: (id: string) => void }) {
  return (
    <section className="panel glass board" data-testid="stage-board">
      <div className="panel-head">
        <h2>冒険の進み具合</h2>
      </div>
      <div className="board-grid">
        <div className="board-row head" aria-hidden="true">
          <span className="board-who" />
          {Array.from({ length: MAIN }, (_, i) => (
            <span key={i} className="board-cell">
              {enemyForStage(i + 1).icon}
            </span>
          ))}
        </div>
        {people.map((p) => {
          const tower = p.stage > MAIN
          return (
            <button key={p.id} className={`board-row ${p.isMe ? 'me' : ''}`} onClick={() => onOpen(p.id)} data-testid="board-row">
              <span className="board-who">
                <Avatar name={p.name} picture={p.picture} size={24} />
              </span>
              {Array.from({ length: MAIN }, (_, i) => {
                const n = i + 1
                const state = n < p.stage ? 'cleared' : n === p.stage ? 'here' : 'ahead'
                return (
                  <span key={n} className={`board-cell ${state}`}>
                    {state === 'here' ? <Avatar name={p.name} picture={p.picture} size={22} /> : <i />}
                  </span>
                )
              })}
              {tower && <span className="board-tower">🗼{p.stage - MAIN}F</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
