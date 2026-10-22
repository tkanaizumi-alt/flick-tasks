import { enemyForStage, levelInfo, type PlayerState } from '../../shared/game'
import { Avatar } from './Dock'

/** レベル・XP バー・到達ステージ。冒険画面とみんなの詳細で共通 */
export function CharacterHeader({ name, picture, player, gold }: { name: string; picture?: string; player: PlayerState; gold?: boolean }) {
  const lv = levelInfo(player.xp)
  const current = enemyForStage(player.stage)
  return (
    <section className="panel glass char">
      <Avatar name={name} picture={picture} size={52} />
      <div className="char-body">
        <div className="char-top">
          <span className="char-name">{name}</span>
          {gold && (
            <span className="char-gold" data-testid="gold">
              💰{player.gold}
            </span>
          )}
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
          <span>
            ステージ {player.stage} {current.icon} {current.name}
          </span>
        </div>
      </div>
    </section>
  )
}
