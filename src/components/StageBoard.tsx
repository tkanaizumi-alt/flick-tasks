import type { Person } from '../../shared/types'
import { MAIN_STAGES, OPEN_STAGES, enemyForStage } from '../../shared/game'
import { Avatar } from './Dock'

/** 道の目印 (ステージ番号とアイコン)。31 から先はシークレットなので、ボスの姿は出さない */
const MILESTONES: { n: number; icon: string }[] = [
  { n: 1, icon: enemyForStage(1).icon },
  { n: 25, icon: enemyForStage(25).icon },
  { n: 50, icon: '🌌' },
  { n: 75, icon: '🌌' },
  { n: MAIN_STAGES, icon: '🏁' },
]
/** 10 ステージごとの目盛り */
const TICKS = Array.from({ length: MAIN_STAGES / 10 - 1 }, (_, i) => (i + 1) * 10)

/** 誰がどのステージにいるかを一目で: ステージ 100 までの道に各自のアイコンを置く (31 から先はシークレットの区間) */
export function StageBoard({ people, onOpen }: { people: Person[]; onOpen: (id: string) => void }) {
  const pos = (stage: number) => `${((Math.min(stage, MAIN_STAGES) - 1) / (MAIN_STAGES - 1)) * 100}%`
  return (
    <section className="panel glass board" data-testid="stage-board">
      <div className="panel-head">
        <h2>冒険の進み具合</h2>
      </div>
      <div className="track-head" aria-hidden="true">
        {MILESTONES.map((m) => (
          <span key={m.n} style={{ left: pos(m.n) }}>
            {m.icon}
            <small>{m.n}</small>
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
                <span className="track-secret" style={{ left: pos(OPEN_STAGES) }} />
                <span className="track-fill" style={{ width: pos(p.stage) }} />
                {TICKS.map((n) => (
                  <i key={n} className={`track-tick ${n === OPEN_STAGES ? 'gate' : ''}`} style={{ left: pos(n) }} />
                ))}
                <span className="track-me" style={{ left: pos(p.stage) }}>
                  <Avatar name={p.name} picture={p.picture} skin={p.skin} size={24} />
                </span>
              </span>
              <span className="track-stage">{p.stage > MAIN_STAGES ? `🗼${p.stage - MAIN_STAGES}F` : `${boss.icon}${p.stage}`}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
