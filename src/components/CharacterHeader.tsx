import { enemyForStage, levelInfo, type PlayerState } from '../../shared/game'
import { Avatar } from './Dock'

/** レベル・XP バー・到達ステージ。冒険画面とみんなの詳細で共通 */
export function CharacterHeader({ name, picture, player }: { name: string; picture?: string; player: PlayerState }) {
  const lv = levelInfo(player.xp)
  const cleared = player.stage - 1
  const last = cleared > 0 ? enemyForStage(cleared) : null
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
        <div className="xp-bar" aria-label="経験値">
          <span style={{ transform: `scaleX(${lv.current / lv.next})` }} />
        </div>
        <div className="char-meta">
          <span data-testid="xp">
            {lv.current} / {lv.next} XP
          </span>
          <span>{last ? `${last.icon} ${last.name} 撃破` : 'まだ撃破なし'}</span>
        </div>
      </div>
    </section>
  )
}
