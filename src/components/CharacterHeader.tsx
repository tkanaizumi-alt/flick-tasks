import { enemyForStage, levelInfo, type PlayerState } from '../../shared/game'
import { Avatar } from './Dock'

/** レベル・職業・XP バー・現在のステージ。冒険画面とみんなの詳細で共通 */
export function CharacterHeader({ name, picture, player, gold }: { name: string; picture?: string; player: PlayerState; gold?: boolean }) {
  const lv = levelInfo(player.xp)
  const current = enemyForStage(player.stage)
  return (
    <section className="panel glass char">
      <Avatar name={name} picture={picture} size={52} />
      <div className="char-body">
        <div className="char-top">
          <span className="char-name">{name}</span>
          <span className="char-lv" data-testid="level">
            Lv {lv.level}
          </span>
        </div>
        <div className="char-sub">
          <span className="char-job" data-testid="current-job">
            {player.job.icon} {player.job.name} <small>職業Lv{player.jobLevel >= 30 ? 'MAX' : player.jobLevel}</small>
          </span>
          {gold && (
            <span className="char-gold" data-testid="gold">
              💰{player.gold}
            </span>
          )}
        </div>
        <div className="xp-bar" aria-label="経験値">
          <span style={{ transform: `scaleX(${lv.current / lv.next})` }} />
        </div>
        <div className="char-meta">
          <span data-testid="xp">
            {lv.current} / {lv.next} XP
          </span>
          <span>
            ステージ {player.stage} {current.icon} {current.name}
          </span>
        </div>
      </div>
    </section>
  )
}
